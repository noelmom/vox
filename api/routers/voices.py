import uuid
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from api.core.audio import audio_duration_seconds, INGESTABLE_EXTENSIONS, convert_to_wav, trim_wav_edges
from api.core.config import settings
from api.core.db import get_db
from api.core.logger import get_logger
from api.core.validation import (
    MAX_DESCRIPTION_CHARS,
    MAX_DISPLAY_NAME_CHARS,
    normalize_voice_name,
    validate_generation_params,
    validate_icon_data,
    validate_optional_text,
    validate_tags,
    validate_upload_size,
)
from api.models.voice import VoiceOut, VoiceParams, _parse_tags, _serialize_tags

router = APIRouter(prefix="/voices", tags=["voices"])
log = get_logger(__name__)


def _safe_name(raw: str) -> str:
    return normalize_voice_name(raw)


def _enforce_duration_limit(wav_path: Path):
    duration_s = audio_duration_seconds(wav_path)
    max_s = settings.max_voice_clip_duration_s
    if duration_s > max_s:
        raise HTTPException(
            status_code=400,
            detail=f"Voice clip is {duration_s:.1f}s, which exceeds the configured limit of {max_s}s. Trim it and try again.",
        )


async def _register_voice(
    db,
    name: str,
    wav_path: Path,
    original_filename: str,
    description: str | None,
    params: VoiceParams,
    rid: str = "-",
    tags: list[str] | None = None,
) -> dict:
    voice_id = str(uuid.uuid4())
    tags_str = _serialize_tags(tags or [])
    await db.execute(
        """INSERT INTO voices
               (id, name, filename, original_filename, description, tags,
                exaggeration, cfg_weight, temperature,
                repetition_penalty, top_p, min_p)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
               filename=excluded.filename,
               original_filename=excluded.original_filename,
               description=COALESCE(excluded.description, description),
               tags=CASE WHEN excluded.tags != '' THEN excluded.tags ELSE tags END,
               exaggeration=excluded.exaggeration,
               cfg_weight=excluded.cfg_weight,
               temperature=excluded.temperature,
               repetition_penalty=excluded.repetition_penalty,
               top_p=excluded.top_p,
               min_p=excluded.min_p,
               status='active',
               deleted_at=NULL""",
        (
            voice_id, name, wav_path.name, original_filename, description, tags_str,
            params.exaggeration, params.cfg_weight, params.temperature,
            params.repetition_penalty, params.top_p, params.min_p,
        ),
    )
    await db.commit()
    log.info("Voice registered: %s -> %s", name, wav_path.name, extra={"request_id": rid})

    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        return dict(await cur.fetchone())


@router.get(
    "",
    response_model=list[VoiceOut],
    summary="List voice profiles",
    description="Returns all registered voice profiles ordered alphabetically. Each profile includes its stored TTS parameter defaults and any user customisations (display name, icon, favourite status).",
    response_description="Array of voice profile objects",
)
async def list_voices(request: Request):
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE status='active' ORDER BY name") as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get(
    "/{name}",
    response_model=VoiceOut,
    summary="Get a voice profile",
    description="Fetch a single voice profile by its slug — the URL-safe name assigned on upload (lowercase, spaces replaced with hyphens).",
    response_description="Voice profile object",
    responses={404: {"description": "Voice profile not found"}},
)
async def get_voice(name: str, request: Request):
    name = normalize_voice_name(name)
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ? AND status='active'", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")
    return dict(row)


@router.post(
    "",
    response_model=VoiceOut,
    status_code=201,
    summary="Upload a voice profile",
    description="""Upload a voice reference clip and register it as a named profile for use in TTS generation.

**Accepted formats:** WAV, MP3, FLAC, OGG, M4A, WEBM. All formats are converted to 24 kHz mono WAV internally.

**Tips for best results:**
- 10–30 seconds of clean, natural speech with no background music or noise.
- Avoid heavy reverb, echo, or processing.
- The `name` field becomes a URL-safe slug: lowercase, spaces → hyphens (e.g. `"Noel Normal"` → `noelmo-normal`).

If a profile with the same name already exists it is overwritten.
""",
    response_description="Created (or updated) voice profile",
    responses={
        201: {"description": "Voice profile created"},
        400: {"description": "Unsupported audio format"},
    },
)
async def create_voice(
    request: Request,
    name: str = Form(...),
    description: str | None = Form(None),
    tags: str = Form("uploaded"),
    file: UploadFile = File(...),
    # optional per-voice TTS defaults
    exaggeration: float | None = Form(None),
    cfg_weight: float | None = Form(None),
    temperature: float | None = Form(None),
    repetition_penalty: float | None = Form(None),
    top_p: float | None = Form(None),
    min_p: float | None = Form(None),
):
    rid = request.state.request_id
    original_filename = file.filename or "unknown"
    suffix = Path(original_filename).suffix.lower()

    if suffix not in INGESTABLE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Accepted: {sorted(INGESTABLE_EXTENSIONS)}",
        )

    safe = _safe_name(name)
    description = validate_optional_text(description, "description", MAX_DESCRIPTION_CHARS)
    parsed_tags = validate_tags(_parse_tags(tags))
    validate_generation_params({
        "exaggeration": exaggeration,
        "cfg_weight": cfg_weight,
        "temperature": temperature,
        "repetition_penalty": repetition_penalty,
        "top_p": top_p,
        "min_p": min_p,
    })
    wav_dest = settings.voice_dir / f"{safe}.wav"
    deleted_match = settings.voice_dir / "deleted" / f"{safe}.wav"
    deleted_match.unlink(missing_ok=True)
    deleted_match.with_suffix(".json").unlink(missing_ok=True)
    tmp_paths: list[Path] = []
    tmp_wav: Path | None = None

    raw_bytes = validate_upload_size(await file.read(), "Voice")

    if suffix == ".wav":
        tmp_wav = settings.voice_dir / f"tmp_{uuid.uuid4()}.wav"
        tmp_wav.write_bytes(raw_bytes)
        tmp_paths.append(tmp_wav)
    else:
        tmp = settings.voice_dir / f"tmp_{uuid.uuid4()}{suffix}"
        tmp.write_bytes(raw_bytes)
        tmp_paths.append(tmp)
        try:
            tmp_wav = settings.voice_dir / f"tmp_{uuid.uuid4()}.wav"
            tmp_paths.append(tmp_wav)
            convert_to_wav(tmp, tmp_wav)
        finally:
            tmp.unlink(missing_ok=True)
        log.info("Converted %s -> %s", original_filename, wav_dest.name, extra={"request_id": rid})

    if tmp_wav is None:
        raise HTTPException(status_code=500, detail="Voice upload conversion failed.")

    try:
        trim_wav_edges(tmp_wav)
        _enforce_duration_limit(tmp_wav)
        tmp_wav.replace(wav_dest)
        tmp_paths.remove(tmp_wav)
    except Exception:
        for p in tmp_paths:
            p.unlink(missing_ok=True)
        raise

    params = VoiceParams(
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
        temperature=temperature,
        repetition_penalty=repetition_penalty,
        top_p=top_p,
        min_p=min_p,
    )
    db = await get_db()
    return await _register_voice(db, safe, wav_dest, original_filename, description, params, rid, tags=parsed_tags)


@router.get(
    "/{name}/audio",
    summary="Download voice reference audio",
    description="Stream the raw WAV file used as the voice cloning reference for this profile.",
    response_description="WAV audio stream",
    responses={
        404: {"description": "Voice profile not found"},
        410: {"description": "Audio file is missing on disk"},
    },
)
async def get_voice_audio(name: str, request: Request):
    name = normalize_voice_name(name)
    db = await get_db()
    async with db.execute("SELECT filename FROM voices WHERE name = ? AND status='active'", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")
    wav_path = settings.voice_dir / row["filename"]
    if not wav_path.exists():
        raise HTTPException(status_code=410, detail="Voice audio file is missing on disk")
    return FileResponse(str(wav_path), media_type="audio/wav")


@router.patch(
    "/{name}",
    response_model=VoiceOut,
    summary="Update voice profile settings",
    description="""Update one or more fields on an existing voice profile. All fields are optional — only supplied fields are changed.

**Clearing optional fields:** pass an empty string (`""`) for `display_name` or `icon_data` to reset them to `null`.

**TTS parameter defaults:** the six generation parameters (`temperature`, `exaggeration`, etc.) stored on a voice profile act as defaults that are applied before any per-request overrides.

**Favourite / display customisation:** `is_favorite` (0 or 1), `display_name`, and `icon_data` (base64 PNG) are UI-only fields used by the Vox app.
""",
    response_description="Updated voice profile",
    responses={404: {"description": "Voice profile not found"}},
)
async def update_voice_params(
    name: str,
    request: Request,
    description: str | None = Form(None),
    tags: str | None = Form(None),
    exaggeration: float | None = Form(None),
    cfg_weight: float | None = Form(None),
    temperature: float | None = Form(None),
    repetition_penalty: float | None = Form(None),
    top_p: float | None = Form(None),
    min_p: float | None = Form(None),
    # user personalisation fields
    is_favorite: int | None = Form(None),   # 0 or 1; None = don't change
    display_name: str | None = Form(None),  # "" = clear to null; None = don't change
    icon_data: str | None = Form(None),     # "" = clear to null; None = don't change
):
    rid = request.state.request_id
    name = normalize_voice_name(name)
    description = validate_optional_text(description, "description", MAX_DESCRIPTION_CHARS)
    parsed_tags = validate_tags(_parse_tags(tags)) if tags is not None else None
    display_name = validate_optional_text(display_name, "display_name", MAX_DISPLAY_NAME_CHARS)
    icon_data = validate_icon_data(icon_data)
    if is_favorite is not None and is_favorite not in {0, 1}:
        raise HTTPException(status_code=422, detail="is_favorite must be 0 or 1.")
    validate_generation_params({
        "exaggeration": exaggeration,
        "cfg_weight": cfg_weight,
        "temperature": temperature,
        "repetition_penalty": repetition_penalty,
        "top_p": top_p,
        "min_p": min_p,
    })
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ? AND status='active'", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    row = dict(row)
    tags_str = _serialize_tags(parsed_tags) if parsed_tags is not None else None

    # Resolve sentinel: None = keep existing; "" = clear to NULL; value = update
    new_display_name = row["display_name"] if display_name is None else (None if display_name == "" else display_name)
    new_icon_data    = row["icon_data"]    if icon_data    is None else (None if icon_data    == "" else icon_data)
    new_is_favorite  = row["is_favorite"]  if is_favorite  is None else int(bool(is_favorite))

    await db.execute(
        """UPDATE voices SET
               description=COALESCE(?, description),
               tags=COALESCE(?, tags),
               exaggeration=COALESCE(?, exaggeration),
               cfg_weight=COALESCE(?, cfg_weight),
               temperature=COALESCE(?, temperature),
               repetition_penalty=COALESCE(?, repetition_penalty),
               top_p=COALESCE(?, top_p),
               min_p=COALESCE(?, min_p),
               is_favorite=?,
               display_name=?,
               icon_data=?
           WHERE name=?""",
        (description, tags_str, exaggeration, cfg_weight, temperature,
         repetition_penalty, top_p, min_p,
         new_is_favorite, new_display_name, new_icon_data,
         name),
    )
    await db.commit()
    log.info("Voice updated: %s", name, extra={"request_id": rid})

    async with db.execute("SELECT * FROM voices WHERE name = ? AND status='active'", (name,)) as cur:
        return dict(await cur.fetchone())


@router.delete(
    "/{name}",
    status_code=204,
    summary="Delete a voice profile",
    description="Moves the voice profile to a deleted holding area so it can be recovered manually before the deleted-voice TTL expires. Jobs that referenced this voice are not affected.",
    response_description="No content",
    responses={404: {"description": "Voice profile not found"}},
)
async def delete_voice(name: str, request: Request):
    rid = request.state.request_id
    name = normalize_voice_name(name)
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    row = dict(row)
    voice_file = settings.voice_dir / row["filename"]
    deleted_filename = row["filename"]
    if voice_file.exists():
        deleted_dir = settings.voice_dir / "deleted"
        deleted_dir.mkdir(exist_ok=True)
        deleted_file = deleted_dir / voice_file.name
        if deleted_file.exists():
            deleted_file = deleted_dir / f"{voice_file.stem}-{uuid.uuid4().hex[:8]}{voice_file.suffix}"
        deleted_filename = deleted_file.name
        voice_file.replace(deleted_file)

        sidecar = deleted_file.with_suffix(".json")
        deleted_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        sidecar.write_text(json.dumps({
            "name": row["name"],
            "description": row["description"],
            "tags": row["tags"],
            "deleted_at": deleted_at,
            "original_filename": row["original_filename"],
            "filename": deleted_file.name,
        }, indent=2))

    await db.execute(
        "UPDATE voices SET filename=?, status='deleted', deleted_at=datetime('now') WHERE name = ?",
        (deleted_filename, name),
    )
    await db.commit()
    log.info("Voice deleted: %s", name, extra={"request_id": rid})
