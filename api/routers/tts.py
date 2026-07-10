import time
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from api.core.audio import (
    INGESTABLE_EXTENSIONS, VALID_MP3_BITRATES, VALID_WAV_DEPTHS,
    audio_duration_seconds, convert_to_wav, trim_wav_edges,
)
from api.core.chunker import clamp_max_chars, split_text
from api.core.config import settings
from api.core.db import get_db
from api.core.data_safety import canonical_voice_slug, generation_parameter_values, managed_path, stream_upload
from api.core.engine import get_model_status, is_model_ready
from api.core.generation import get_generation_coordinator
from api.core.generation_protocol import GenerationChunk, GenerationRequest
from api.core.logger import get_logger
from api.core.presets import PRESETS

router = APIRouter(prefix="/tts", tags=["tts"])
log = get_logger(__name__)


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

    canonical_name = canonical_voice_slug(voice_name)
    async with db.execute(
        "SELECT id, filename FROM voices WHERE name = ? AND status='active'", (canonical_name,)
    ) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Voice profile '{canonical_name}' not found. Use GET /api/v1/voices to see available profiles.",
        )

    wav_path = managed_path(settings.voice_dir, row["filename"])
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

    if not text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty.")
    if len(text) > settings.max_script_chars:
        raise HTTPException(status_code=413, detail=f"Text exceeds the {settings.max_script_chars:,} character limit.")
    if len(preset) > 80:
        raise HTTPException(status_code=422, detail="Preset name is too long.")

    if not is_model_ready():
        status = get_model_status()
        raise HTTPException(
            status_code=503,
            detail=f"Model is {status['state']}. Try again once Vox is ready.",
        )

    preset_name = preset.lower()
    output_format_name = output_format.lower()

    if output_format_name not in {"mp3", "wav"}:
        raise HTTPException(status_code=422, detail="output_format must be mp3 or wav.")

    if mp3_bitrate is not None and mp3_bitrate not in VALID_MP3_BITRATES:
        raise HTTPException(status_code=422, detail=f"mp3_bitrate must be one of {sorted(VALID_MP3_BITRATES)}")
    if wav_bit_depth is not None and wav_bit_depth not in VALID_WAV_DEPTHS:
        raise HTTPException(status_code=422, detail=f"wav_bit_depth must be one of {sorted(VALID_WAV_DEPTHS)}")
    request_overrides = generation_parameter_values(
        temperature=temperature,
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
        repetition_penalty=repetition_penalty,
        top_p=top_p,
        min_p=min_p,
    )
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
            if suffix == ".wav":
                tmp_path = managed_path(settings.output_dir, f"tmp_voice_{uuid.uuid4()}.wav")
                await stream_upload(voice, tmp_path, max_bytes=settings.max_voice_upload_mb * 1024 * 1024)
                tmp_paths.append(tmp_path)
                trim_wav_edges(tmp_path)
                _enforce_duration_limit(tmp_path)
                audio_prompt_path = tmp_path
            else:
                tmp_src = managed_path(settings.output_dir, f"tmp_voice_{uuid.uuid4()}{suffix}")
                tmp_wav = managed_path(settings.output_dir, f"{tmp_src.stem}.wav")
                await stream_upload(voice, tmp_src, max_bytes=settings.max_voice_upload_mb * 1024 * 1024)
                tmp_paths.extend([tmp_src, tmp_wav])
                convert_to_wav(tmp_src, tmp_wav)
                tmp_src.unlink(missing_ok=True)
                tmp_paths.remove(tmp_src)
                trim_wav_edges(tmp_wav)
                _enforce_duration_limit(tmp_wav)
                audio_prompt_path = tmp_wav
        except Exception as exc:
            for p in tmp_paths:
                p.unlink(missing_ok=True)
            detail = exc.detail if isinstance(exc, HTTPException) else "Inline voice upload could not be processed."
            await db.execute(
                "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now') WHERE request_id=?",
                (str(detail), rid),
            )
            await db.commit()
            raise

    chunks = split_text(text, chunk_max_chars, settings.chunk_headroom_chars)
    partial_dir = settings.output_dir / ".partial" / rid
    generation_request = GenerationRequest(
        request_id=rid,
        chunks=tuple(GenerationChunk(chunk.text, chunk.pause_after_s) for chunk in chunks),
        params=params,
        audio_prompt_path=str(audio_prompt_path) if audio_prompt_path else None,
        partial_dir=str(partial_dir),
        output_format=output_format_name,
        mp3_bitrate=mp3_bitrate,
        wav_bit_depth=wav_bit_depth,
        submitted_at=time.time(),
    )
    await get_generation_coordinator().submit(generation_request)

    return JSONResponse({"request_id": rid}, status_code=202)


@router.post(
    "/{request_id}/cancel",
    summary="Cancel a running generation job",
    description="Requests cancellation. Active work enters `cancelling` until the isolated model worker has stopped and been reaped; only then does the job become `cancelled`.",
    responses={
        200: {"description": "Job cancelled or already cancelled"},
        404: {"description": "Job not found"},
    },
)
async def cancel_generation(request_id: str, request: Request):
    db = await get_db()
    async with db.execute("SELECT status FROM jobs WHERE request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    if row["status"] in {"completed", "failed", "cancelled"}:
        return JSONResponse({"request_id": request_id, "status": row["status"]})

    status = await get_generation_coordinator().cancel(request_id)
    return JSONResponse({"request_id": request_id, "status": status})
