import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from api.core.audio import INGESTABLE_EXTENSIONS, convert_to_wav
from api.core.config import settings
from api.core.db import get_db
from api.core.logger import get_logger
from api.models.voice import VoiceOut, VoiceParams, _parse_tags, _serialize_tags

router = APIRouter(prefix="/voices", tags=["voices"])
log = get_logger(__name__)


def _safe_name(raw: str) -> str:
    return raw.strip().lower().replace(" ", "-")


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
               min_p=excluded.min_p""",
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


@router.get("", response_model=list[VoiceOut])
async def list_voices(request: Request):
    db = await get_db()
    async with db.execute("SELECT * FROM voices ORDER BY name") as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/{name}", response_model=VoiceOut)
async def get_voice(name: str, request: Request):
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")
    return dict(row)


@router.post("", response_model=VoiceOut, status_code=201)
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
    wav_dest = settings.voice_dir / f"{safe}.wav"

    raw_bytes = await file.read()

    if suffix == ".wav":
        wav_dest.write_bytes(raw_bytes)
    else:
        tmp = settings.voice_dir / f"tmp_{uuid.uuid4()}{suffix}"
        tmp.write_bytes(raw_bytes)
        try:
            convert_to_wav(tmp, wav_dest)
        finally:
            tmp.unlink(missing_ok=True)
        log.info("Converted %s -> %s", original_filename, wav_dest.name, extra={"request_id": rid})

    params = VoiceParams(
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
        temperature=temperature,
        repetition_penalty=repetition_penalty,
        top_p=top_p,
        min_p=min_p,
    )
    db = await get_db()
    return await _register_voice(db, safe, wav_dest, original_filename, description, params, rid, tags=_parse_tags(tags))


@router.get("/{name}/audio")
async def get_voice_audio(name: str, request: Request):
    db = await get_db()
    async with db.execute("SELECT filename FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")
    wav_path = settings.voice_dir / row["filename"]
    if not wav_path.exists():
        raise HTTPException(status_code=410, detail="Voice audio file is missing on disk")
    return FileResponse(str(wav_path), media_type="audio/wav")


@router.patch("/{name}", response_model=VoiceOut)
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
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    row = dict(row)
    tags_str = _serialize_tags(_parse_tags(tags)) if tags is not None else None

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

    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        return dict(await cur.fetchone())


@router.delete("/{name}", status_code=204)
async def delete_voice(name: str, request: Request):
    rid = request.state.request_id
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    voice_file = settings.voice_dir / row["filename"]
    if voice_file.exists():
        voice_file.unlink()

    await db.execute("DELETE FROM voices WHERE name = ?", (name,))
    await db.commit()
    log.info("Voice deleted: %s", name, extra={"request_id": rid})
