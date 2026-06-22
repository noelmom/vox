import asyncio
import time
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from api.core.audio import INGESTABLE_EXTENSIONS, convert_to_wav, export_mp3
from api.core.chunker import clamp_max_chars, split_text
from api.core.config import settings
from api.core.db import get_db
from api.core.engine import get_lock, get_model
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
            detail=f"Voice profile '{voice_name}' not found. Use GET /voices to see available profiles.",
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
        async with get_lock():
            generation_start = time.time()
            audio_segments = []

            for chunk in chunks:
                wav = model.generate(
                    text=chunk,
                    audio_prompt_path=str(audio_prompt_path) if audio_prompt_path else None,
                    **params,
                )
                audio = wav.squeeze().cpu().numpy()
                audio_segments.append(audio)
                audio_segments.append(np.zeros(int(model.sr * 0.25), dtype=audio.dtype))

            generation_s = time.time() - generation_start

        final_audio = np.concatenate(audio_segments)
        audio_duration_s = len(final_audio) / model.sr
        rtf = generation_s / audio_duration_s if audio_duration_s > 0 else 0

        output_id = uuid.uuid4()
        wav_path = settings.output_dir / f"{output_id}.wav"
        sf.write(str(wav_path), final_audio, model.sr)

        encode_s = None
        output_path = wav_path

        if output_format_name == "mp3":
            mp3_path = settings.output_dir / f"{output_id}.mp3"
            t0 = time.time()
            export_mp3(wav_path, mp3_path)
            encode_s = time.time() - t0
            wav_path.unlink(missing_ok=True)
            output_path = mp3_path

        total_s = time.time() - request_start

        await db.execute(
            """UPDATE jobs SET
                status='completed', output_path=?, chunks=?,
                audio_duration_s=?, generation_s=?, encode_s=?,
                total_s=?, rtf=?, completed_at=datetime('now')
               WHERE request_id=?""",
            (str(output_path), len(chunks), audio_duration_s,
             generation_s, encode_s, total_s, rtf, rid),
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


@router.post("")
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
):
    rid = request.state.request_id
    db = await get_db()

    preset_name = preset.lower()
    output_format_name = output_format.lower()
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
    ))

    return JSONResponse({"request_id": rid}, status_code=202)
