import asyncio
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from api.core.audio import (
    INGESTABLE_EXTENSIONS, VALID_MP3_BITRATES, VALID_WAV_DEPTHS, WAV_SUBTYPES,
    audio_duration_seconds, convert_to_wav, export_mp3, trim_wav_edges,
)
from api.core.chunker import clamp_max_chars, split_text
from api.core.config import settings
from api.core.db import get_db
from api.core.engine import get_device, get_lock, get_model, get_model_status, is_model_ready
from api.core.logger import get_logger
from api.core.presets import PRESETS
from api.core.validation import (
    normalize_voice_name,
    validate_generation_params,
    validate_text,
    validate_upload_size,
    validate_uuid,
)

router = APIRouter(prefix="/tts", tags=["tts"])
log = get_logger(__name__)

_ACTIVE_TASKS: dict[str, asyncio.Task] = {}

EDGE_TRIM_PAD_S = 0.005
CHUNK_GENERATION_ATTEMPTS = 3
CHUNK_GENERATION_TIMEOUT_BASE_S = 120
CHUNK_GENERATION_TIMEOUT_PER_CHAR_S = 2.5
CHUNK_GENERATION_TIMEOUT_MAX_S = 300


def _trim_edge_silence(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Trim near-silent samples from the beginning and end of a chunk.

    This keeps the model's internal pauses intact while removing the dead air
    that can appear around chunk boundaries.
    """
    if audio.size == 0:
        return audio

    peak = float(np.max(np.abs(audio)))
    if peak <= 0.0:
        return audio[:0]

    threshold = max(3e-4, peak * 0.02)
    silent = np.abs(audio) <= threshold
    if not silent.any():
        return audio

    start = 0
    end = audio.size

    while start < end and silent[start]:
        start += 1
    while end > start and silent[end - 1]:
        end -= 1

    if start >= end:
        return audio[:0]

    # Keep a tiny cushion so we do not clip the first/last phoneme too tightly.
    pad = int(sample_rate * EDGE_TRIM_PAD_S)
    return audio[max(0, start - pad) : min(audio.size, end + pad)]


def _stitch_chunks(chunks: list[tuple[np.ndarray, float]], sample_rate: int) -> np.ndarray:
    """Join generated chunks and restore a small pause where the text boundary needs it."""
    if not chunks:
        return np.array([], dtype=np.float32)

    pieces: list[np.ndarray] = []
    output_dtype = next((chunk.dtype for chunk, _ in chunks if chunk.size), np.float32)

    for index, (chunk, pause_after_s) in enumerate(chunks):
        if chunk.size:
            pieces.append(chunk)
            if pause_after_s > 0 and index < len(chunks) - 1:
                pieces.append(np.zeros(int(sample_rate * pause_after_s), dtype=output_dtype))

    if not pieces:
        return np.array([], dtype=np.float32)
    return np.concatenate(pieces)


def _minimum_expected_chunk_duration_s(text: str) -> float:
    """Catch obvious model early-stops without rejecting genuinely short clips."""
    chars = len(text.strip())
    if chars < 80:
        return 0.0
    return min(10.0, max(3.0, chars / 28))


def _generation_timeout_s(text: str) -> float:
    """Bound one chunk render so a wedged model call cannot hold a job forever."""
    chars = len(text.strip())
    return min(
        CHUNK_GENERATION_TIMEOUT_MAX_S,
        max(CHUNK_GENERATION_TIMEOUT_BASE_S, chars * CHUNK_GENERATION_TIMEOUT_PER_CHAR_S),
    )


def _enforce_duration_limit(wav_path: Path):
    duration_s = audio_duration_seconds(wav_path)
    max_s = settings.max_voice_clip_duration_s
    if duration_s > max_s:
        raise HTTPException(
            status_code=400,
            detail=f"Voice clip is {duration_s:.1f}s, which exceeds the configured limit of {max_s}s. Trim it and try again.",
        )


async def _resolve_voice(voice_name: str | None, rid: str, db) -> tuple[Path | None, str | None]:
    if not voice_name:
        return None, None

    async with db.execute(
        "SELECT id, filename FROM voices WHERE name = ? AND status='active'", (voice_name,)
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
        chunks = split_text(text, chunk_max_chars, settings.chunk_headroom_chars)
        if not chunks:
            await db.execute(
                "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
                ("Text cannot be empty.", rid),
            )
            await db.commit()
            return

        model = get_model()
        loop = asyncio.get_running_loop()
        async with get_lock():
            await db.execute("UPDATE jobs SET status='processing' WHERE request_id=?", (rid,))
            await db.commit()

            log.info(
                "TTS job started: preset=%s chunks=%d format=%s",
                preset_name, len(chunks), output_format_name,
                extra={"request_id": rid},
            )

            generation_start = time.time()
            audio_segments = []

            for i, chunk in enumerate(chunks):
                prompt_path = str(audio_prompt_path) if audio_prompt_path else None
                min_duration_s = _minimum_expected_chunk_duration_s(chunk.text)
                timeout_s = _generation_timeout_s(chunk.text)
                last_duration_s = 0.0
                audio = np.array([], dtype=np.float32)

                for attempt in range(1, CHUNK_GENERATION_ATTEMPTS + 1):
                    # Run blocking model inference in a thread so the event loop stays
                    # free to serve status-poll requests while generation is in progress.
                    try:
                        wav = await asyncio.wait_for(
                            loop.run_in_executor(
                                None,
                                lambda c=chunk.text, p=prompt_path: model.generate(
                                    text=c,
                                    audio_prompt_path=p,
                                    **params,
                                ),
                            ),
                            timeout=timeout_s,
                        )
                    except asyncio.TimeoutError as exc:
                        raise RuntimeError(
                            f"Generation timed out on chunk {i + 1} after {timeout_s:.0f}s. "
                            "The model did not return audio in time."
                        ) from exc

                    audio = wav.squeeze().cpu().numpy()
                    audio = _trim_edge_silence(audio, model.sr)
                    last_duration_s = len(audio) / model.sr if model.sr else 0.0
                    if min_duration_s == 0.0 or last_duration_s >= min_duration_s:
                        break
                    log.warning(
                        "TTS chunk looked truncated: chunk=%d attempt=%d duration=%.2fs min_expected=%.2fs chars=%d",
                        i + 1, attempt, last_duration_s, min_duration_s, len(chunk.text),
                        extra={"request_id": rid},
                    )

                if min_duration_s > 0.0 and last_duration_s < min_duration_s:
                    raise RuntimeError(
                        f"Generation stopped early on chunk {i + 1}. "
                        f"Produced {last_duration_s:.1f}s for {len(chunk.text)} characters after {CHUNK_GENERATION_ATTEMPTS} attempts."
                    )

                audio_segments.append((audio, chunk.pause_after_s if i < len(chunks) - 1 else 0.0))

            generation_s = time.time() - generation_start

        final_audio = _stitch_chunks(audio_segments, model.sr)
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
        device = get_device()

        await db.execute(
            """UPDATE jobs SET
                status='completed', output_path=?, chunks=?,
                audio_duration_s=?, generation_s=?, encode_s=?,
                total_s=?, rtf=?, device=?,
                completed_at=datetime('now')
               WHERE request_id=? AND status NOT IN ('cancelled', 'failed')""",
            (str(output_path), len(chunks), audio_duration_s,
             generation_s, encode_s, total_s, rtf, device, rid),
        )
        await db.commit()

        log.info(
            "TTS job completed: duration=%.2fs generation=%.2fs rtf=%.2f",
            audio_duration_s, generation_s, rtf,
            extra={"request_id": rid},
        )

    except asyncio.CancelledError:
        try:
            await db.execute(
                "UPDATE jobs SET status='cancelled', error=?, completed_at=datetime('now') WHERE request_id=? AND status != 'completed'",
                ("Generation cancelled by user.", rid),
            )
            await db.commit()
        except Exception:
            pass
        log.info("TTS job cancelled", extra={"request_id": rid})
        raise

    except Exception as exc:
        await db.execute(
            "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=? AND status != 'cancelled'",
            (str(exc), rid),
        )
        await db.commit()
        log.error("TTS job failed: %s", exc, extra={"request_id": rid})

    finally:
        for p in tmp_paths:
            p.unlink(missing_ok=True)
        _ACTIVE_TASKS.pop(rid, None)


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

Long text is split at sentence boundaries. `max_chars` sets the maximum chunk length (default 450, range 100–3000). Vox also reserves `VOX_CHUNK_HEADROOM_CHARS` of breathing room below that limit so sentence endings are less likely to be cut off or hallucinate at chunk boundaries. Shorter chunks generate faster but prosody may vary at boundaries.

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
    user_agent = request.headers.get("User-Agent")
    db = await get_db()

    if not is_model_ready():
        status = get_model_status()
        raise HTTPException(
            status_code=503,
            detail=f"Model is {status['state']}. Try again once Vox is ready.",
        )

    preset_name = preset.lower()
    output_format_name = output_format.lower()
    text = validate_text(text)
    if len(preset_name) > 64:
        raise HTTPException(status_code=422, detail="preset must be 64 characters or less.")
    if voice_name:
        voice_name = normalize_voice_name(voice_name)

    if output_format_name not in {"mp3", "wav"}:
        raise HTTPException(status_code=422, detail="output_format must be either 'mp3' or 'wav'.")

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
        """INSERT INTO jobs (request_id, status, text, preset, output_format, user_agent)
           VALUES (?, 'queued', ?, ?, ?, ?)""",
        (rid, text, preset_name, output_format_name, user_agent),
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
    validate_generation_params(request_overrides)
    params.update({k: v for k, v in request_overrides.items() if v is not None})

    # Handle inline voice file upload — write to disk before returning
    tmp_paths: list[Path] = []
    if voice:
        try:
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
            raw = validate_upload_size(await voice.read(), "Voice")
            if suffix == ".wav":
                tmp_path = settings.output_dir / f"tmp_voice_{uuid.uuid4()}.wav"
                tmp_path.write_bytes(raw)
                tmp_paths.append(tmp_path)
                trim_wav_edges(tmp_path)
                _enforce_duration_limit(tmp_path)
                audio_prompt_path = tmp_path
            else:
                tmp_src = settings.output_dir / f"tmp_voice_{uuid.uuid4()}{suffix}"
                tmp_wav = tmp_src.with_suffix(".wav")
                tmp_src.write_bytes(raw)
                tmp_paths.extend([tmp_src, tmp_wav])
                convert_to_wav(tmp_src, tmp_wav)
                tmp_src.unlink(missing_ok=True)
                tmp_paths.remove(tmp_src)
                trim_wav_edges(tmp_wav)
                _enforce_duration_limit(tmp_wav)
                audio_prompt_path = tmp_wav
        except Exception:
            for p in tmp_paths:
                p.unlink(missing_ok=True)
            raise

    task = asyncio.create_task(_run_generation(
        rid, text, preset_name, output_format_name,
        chunk_max_chars, params, audio_prompt_path, tmp_paths,
        mp3_bitrate=mp3_bitrate,
        wav_bit_depth=wav_bit_depth,
    ))
    _ACTIVE_TASKS[rid] = task

    return JSONResponse({"request_id": rid}, status_code=202)


@router.post(
    "/{request_id}/cancel",
    summary="Cancel a running generation job",
    description="Cancels an in-flight generation job on the server. If the model is currently inside a blocking chunk render, cancellation lands as soon as that call returns to the event loop.",
    responses={
        200: {"description": "Job cancelled or already cancelled"},
        404: {"description": "Job not found"},
    },
)
async def cancel_generation(request_id: str, request: Request):
    validate_uuid(request_id)
    db = await get_db()
    async with db.execute("SELECT status FROM jobs WHERE request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    if row["status"] in {"completed", "failed", "cancelled"}:
        return JSONResponse({"request_id": request_id, "status": row["status"]})

    await db.execute(
        "UPDATE jobs SET status='cancelled', error=?, completed_at=datetime('now') WHERE request_id=?",
        ("Generation cancelled by user.", request_id),
    )
    await db.commit()

    task = _ACTIVE_TASKS.get(request_id)
    if task and not task.done():
        task.cancel()

    return JSONResponse({"request_id": request_id, "status": "cancelled"})
