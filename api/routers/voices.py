import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from api.core.audio import INGESTABLE_EXTENSIONS, convert_to_wav
from api.core.config import settings
from api.core.db import get_db
from api.core.logger import get_logger
from api.models.voice import VoiceOut, VoiceParams

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
) -> dict:
    voice_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO voices
               (id, name, filename, original_filename, description,
                exaggeration, cfg_weight, temperature,
                repetition_penalty, top_p, min_p)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
               filename=excluded.filename,
               original_filename=excluded.original_filename,
               description=COALESCE(excluded.description, description),
               exaggeration=excluded.exaggeration,
               cfg_weight=excluded.cfg_weight,
               temperature=excluded.temperature,
               repetition_penalty=excluded.repetition_penalty,
               top_p=excluded.top_p,
               min_p=excluded.min_p""",
        (
            voice_id, name, wav_path.name, original_filename, description,
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
    return await _register_voice(db, safe, wav_dest, original_filename, description, params, rid)


@router.patch("/{name}", response_model=VoiceOut)
async def update_voice_params(
    name: str,
    request: Request,
    description: str | None = Form(None),
    exaggeration: float | None = Form(None),
    cfg_weight: float | None = Form(None),
    temperature: float | None = Form(None),
    repetition_penalty: float | None = Form(None),
    top_p: float | None = Form(None),
    min_p: float | None = Form(None),
):
    rid = request.state.request_id
    db = await get_db()
    async with db.execute("SELECT * FROM voices WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    await db.execute(
        """UPDATE voices SET
               description=COALESCE(?, description),
               exaggeration=COALESCE(?, exaggeration),
               cfg_weight=COALESCE(?, cfg_weight),
               temperature=COALESCE(?, temperature),
               repetition_penalty=COALESCE(?, repetition_penalty),
               top_p=COALESCE(?, top_p),
               min_p=COALESCE(?, min_p)
           WHERE name=?""",
        (description, exaggeration, cfg_weight, temperature,
         repetition_penalty, top_p, min_p, name),
    )
    await db.commit()
    log.info("Voice params updated: %s", name, extra={"request_id": rid})

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
