import asyncio
import time
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from api.core.audio import (
    INGESTABLE_EXTENSIONS, VALID_MP3_BITRATES, VALID_WAV_DEPTHS, WAV_SUBTYPES,
    convert_to_wav, export_mp3,
)
from api.core.chunker import clamp_max_chars, split_text
from api.core.config import settings
from api.core.db import get_db
from api.core.engine import get_device, get_lock, get_model
from api.core.logger import get_logger
from api.core.presets import PRESETS

router = APIRouter(prefix="/tts", tags=["tts"])
log = get_logger(__name__)


async def _resolve_voice(voice_name: str | None, rid: str, db) -> tuple[Path | None, str | None]:
    if not voice_name:
        return None, None

    async with db.execute(
        "SELECT id, filename FROM voices WHERE name = ?", (voice_name,)
    ) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Voice profile '{voice_name}' not found. Use GET /api/v1/voices to see available profiles.",
        )

    wav_path = settings.voice_dir / row["filename"]
    if not wav_path.exists():
        log.warning(
            "Voice '%s' is registered in DB but WAV file is missing: %s",
            voice_name, wav_path,
            extra={"request_id": rid},
        )
        raise HTTPException(
            status_code=404,
            detail=f"Voice profile '{voice_name}' is registered but its audio file is missing. Re-upload the voice to fix this.",
        )

    return wav_path, row["id"]


async def _run_generation(
    rid: str,
    text: str,
    preset_name: str,
    output_format_name: str,
    chunk_max_chars: int,
    params: dict,
    audio_prompt_path: Path | None,
    tmp_paths: list[Path],
    mp3_bitrate: int | None = None,
    wav_bit_depth: str | None = None,
):
    """Background task: run TTS generation and update job record when done."""
    request_start = time.time()
    db = await get_db()

    try:
        chunks = split_text(text, chunk_max_chars)
        if not chunks:
            await db.execute(
                "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
                ("Text cannot be empty.", rid),
            )
            await db.commit()
            return

        log.info(
            "TTS job started: preset=%s chunks=%d format=%s",
            preset_name, len(chunks), output_format_name,
            extra={"request_id": rid},
        )

        model = get_model()
        loop = asyncio.get_running_loop()
        async with get_lock():
            generation_start = time.time()
            audio_segments = []

            for chunk in chunks:
                prompt_path = str(audio_prompt_path) if audio_prompt_path else None
                # Run blocking model inference in a thread so the event loop stays
                # free to serve status-poll requests while generation is in progress.
                wav = await loop.run_in_executor(
                    None,
                    lambda c=chunk, p=prompt_path: model.generate(
                        text=c,
                        audio_prompt_path=p,
                        **params,
                    ),
                )
                audio = wav.squeeze().cpu().numpy()
                audio_segments.append(audio)
                audio_segments.append(np.zeros(int(model.sr * 0.25), dtype=audio.dtype))

            generation_s = time.time() - generation_start

        final_audio = np.concatenate(audio_segments)
        audio_duration_s = len(final_audio) / model.sr
        rtf = generation_s / audio_duration_s if audio_duration_s > 0 else 0

        output_id = uuid.uuid4()
        encode_s = None

        if output_format_name == "mp3":
            wav_path = settings.output_dir / f"{output_id}.wav"
            sf.write(str(wav_path), final_audio, model.sr, subtype="PCM_16")
            mp3_path = settings.output_dir / f"{output_id}.mp3"
            t0 = time.time()
            export_mp3(wav_path, mp3_path, bitrate=mp3_bitrate)
            encode_s = time.time() - t0
            wav_path.unlink(missing_ok=True)
            output_path = mp3_path
        else:
            subtype = WAV_SUBTYPES.get(wav_bit_depth or "16", "PCM_16")
            wav_path = settings.output_dir / f"{output_id}.wav"
            sf.write(str(wav_path), final_audio, model.sr, subtype=subtype)
            output_path = wav_path

        total_s = time.time() - request_start
        char_count = len(text)
        word_count = len(text.split())
        device = get_device()

        await db.execute(
            """UPDATE jobs SET
                status='completed', output_path=?, chunks=?,
                audio_duration_s=?, generation_s=?, encode_s=?,
                total_s=?, rtf=?, char_count=?, word_count=?, device=?,
                completed_at=datetime('now')
               WHERE request_id=?""",
            (str(output_path), len(chunks), audio_duration_s,
             generation_s, encode_s, total_s, rtf, char_count, word_count, device, rid),
        )
        await db.commit()

        log.info(
            "TTS job completed: duration=%.2fs generation=%.2fs rtf=%.2f",
            audio_duration_s, generation_s, rtf,
            extra={"request_id": rid},
        )

    except Exception as exc:
        await db.execute(
            "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
            (str(exc), rid),
        )
        await db.commit()
        log.error("TTS job failed: %s", exc, extra={"request_id": rid})

    finally:
        for p in tmp_paths:
            p.unlink(missing_ok=True)


@router.post(
    "",
    summary="Generate speech from text",
    description="""Submit a text-to-speech job. Returns **202 Accepted** immediately with a `request_id`; generation runs in the background on the local GPU/CPU.

**Typical flow**

1. `POST /api/v1/tts` → `{ "request_id": "abc123" }`
2. Poll `GET /api/v1/jobs/{request_id}` until `status == "completed"`
3. Download audio at `GET /api/v1/jobs/{request_id}/audio`

**Voice cloning**

Pass `voice_name` to clone a pre-uploaded profile, or upload a one-off reference clip via the `voice` file field (10–30 s of clean speech recommended).

**Output format**

`output_format` accepts `mp3` (default) or `wav`. Use `mp3_bitrate` to control MP3 quality (64–320 kbps, default 128). Use `wav_bit_depth` to set WAV precision (`16`, `24`, or `32`).

**Chunking**

Long text is split at sentence boundaries. `max_chars` sets the maximum chunk length (default 450, range 100–3000). Shorter chunks generate faster but prosody may vary at boundaries.

**Parameter override order** (lowest → highest priority)

1. Built-in preset defaults
2. Per-voice parameter overrides stored on the voice profile
3. Per-request overrides (`temperature`, `exaggeration`, etc.) passed directly to this endpoint
""",
    response_description="Job accepted. Poll `/api/v1/jobs/{request_id}` for status.",
    responses={
        202: {"description": "Job accepted — `request_id` returned for polling"},
        400: {"description": "Unsupported voice file format"},
        404: {"description": "Named voice profile not found or its audio file is missing"},
        422: {"description": "Validation error — check `mp3_bitrate` or `wav_bit_depth` values"},
    },
)
async def generate_tts(
    request: Request,
    text: str = Form(...),
    preset: str = Form("default"),
    output_format: str = Form("mp3"),
    voice_name: str | None = Form(None),
    voice: UploadFile | None = File(None),
    max_chars: int | None = Form(None),
    temperature: float | None = Form(None),
    exaggeration: float | None = Form(None),
    cfg_weight: float | None = Form(None),
    repetition_penalty: float | None = Form(None),
    top_p: float | None = Form(None),
    min_p: float | None = Form(None),
    mp3_bitrate: int | None = Form(None),
    wav_bit_depth: str | None = Form(None),
):
    rid = request.state.request_id
    db = await get_db()

    preset_name = preset.lower()
    output_format_name = output_format.lower()

    if mp3_bitrate is not None and mp3_bitrate not in VALID_MP3_BITRATES:
        raise HTTPException(status_code=422, detail=f"mp3_bitrate must be one of {sorted(VALID_MP3_BITRATES)}")
    if wav_bit_depth is not None and wav_bit_depth not in VALID_WAV_DEPTHS:
        raise HTTPException(status_code=422, detail=f"wav_bit_depth must be one of {sorted(VALID_WAV_DEPTHS)}")
    chunk_max_chars = clamp_max_chars(
        max_chars,
        settings.default_max_chars,
        settings.min_max_chars,
        settings.max_max_chars,
    )

    await db.execute(
        """INSERT INTO jobs (request_id, status, text, preset, output_format)
           VALUES (?, 'queued', ?, ?, ?)""",
        (rid, text, preset_name, output_format_name),
    )
    await db.commit()

    # Resolve voice profile before launching background task
    try:
        audio_prompt_path, voice_id = await _resolve_voice(voice_name, rid, db)
    except HTTPException as exc:
        await db.execute(
            "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
            (exc.detail, rid),
        )
        await db.commit()
        raise

    if voice_id:
        await db.execute("UPDATE jobs SET voice_id=? WHERE request_id=?", (voice_id, rid))
        await db.commit()

    params = PRESETS.get(preset_name, PRESETS["default"]).copy()

    if voice_id:
        async with db.execute(
            "SELECT exaggeration, cfg_weight, temperature, repetition_penalty, top_p, min_p "
            "FROM voices WHERE id = ?", (voice_id,)
        ) as cur:
            voice_row = await cur.fetchone()
        if voice_row:
            params.update({k: v for k, v in dict(voice_row).items() if v is not None})

    request_overrides = {
        "temperature": temperature,
        "exaggeration": exaggeration,
        "cfg_weight": cfg_weight,
        "repetition_penalty": repetition_penalty,
        "top_p": top_p,
        "min_p": min_p,
    }
    params.update({k: v for k, v in request_overrides.items() if v is not None})

    # Handle inline voice file upload — write to disk before returning
    tmp_paths: list[Path] = []
    if voice:
        suffix = Path(voice.filename or "").suffix.lower()
        if suffix not in INGESTABLE_EXTENSIONS:
            await db.execute(
                "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
                (f"Unsupported voice format '{suffix}'.", rid),
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported voice format '{suffix}'. Accepted: {sorted(INGESTABLE_EXTENSIONS)}",
            )
        raw = await voice.read()
        if suffix == ".wav":
            tmp_path = settings.output_dir / f"tmp_voice_{uuid.uuid4()}.wav"
            tmp_path.write_bytes(raw)
            audio_prompt_path = tmp_path
            tmp_paths.append(tmp_path)
        else:
            tmp_src = settings.output_dir / f"tmp_voice_{uuid.uuid4()}{suffix}"
            tmp_wav = tmp_src.with_suffix(".wav")
            tmp_src.write_bytes(raw)
            convert_to_wav(tmp_src, tmp_wav)
            tmp_src.unlink(missing_ok=True)
            audio_prompt_path = tmp_wav
            tmp_paths.append(tmp_wav)

    await db.execute(
        "UPDATE jobs SET status='processing' WHERE request_id=?", (rid,)
    )
    await db.commit()

    asyncio.create_task(_run_generation(
        rid, text, preset_name, output_format_name,
        chunk_max_chars, params, audio_prompt_path, tmp_paths,
        mp3_bitrate=mp3_bitrate,
        wav_bit_depth=wav_bit_depth,
    ))

    return JSONResponse({"request_id": rid}, status_code=202)
