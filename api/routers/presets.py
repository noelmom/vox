from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.core.db import get_db
from api.core.presets import PRESETS
from api.core.validation import normalize_preset_name

router = APIRouter(prefix="/presets", tags=["presets"])

_BUILTIN = set(PRESETS.keys())


class PresetBody(BaseModel):
    temperature: float = Field(..., ge=0, le=1.5)
    exaggeration: float = Field(..., ge=0, le=1)
    cfg_weight: float = Field(..., ge=0, le=1)
    repetition_penalty: float = Field(..., ge=1, le=2)
    top_p: float = Field(..., ge=0, le=1)
    min_p: float = Field(..., ge=0, le=1)


@router.post(
    "/{name}",
    status_code=204,
    summary="Save a custom preset",
    description="""Create or overwrite a named tone preset. The name is normalised to lowercase.

Built-in presets (`default`, `youtube`, `podcast`, `audiobook`, `conversational`) are read-only and return `409` if targeted.

Custom presets appear alongside built-ins in `GET /api/v1/presets` and can be passed as the `preset` field in `POST /api/v1/tts`.
""",
    response_description="No content",
    responses={
        204: {"description": "Preset saved"},
        409: {"description": "Name conflicts with a built-in preset"},
        422: {"description": "Parameter values out of range"},
    },
)
async def save_preset(name: str, body: PresetBody):
    name = normalize_preset_name(name)
    if name in _BUILTIN:
        raise HTTPException(status_code=409, detail=f"'{name}' is a built-in preset and cannot be overwritten.")
    db = await get_db()
    await db.execute(
        """INSERT INTO user_presets (name, temperature, exaggeration, cfg_weight, repetition_penalty, top_p, min_p)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
               temperature=excluded.temperature,
               exaggeration=excluded.exaggeration,
               cfg_weight=excluded.cfg_weight,
               repetition_penalty=excluded.repetition_penalty,
               top_p=excluded.top_p,
               min_p=excluded.min_p,
               created_at=datetime('now')""",
        (name, body.temperature, body.exaggeration, body.cfg_weight,
         body.repetition_penalty, body.top_p, body.min_p),
    )
    await db.commit()


@router.delete(
    "/{name}",
    status_code=204,
    summary="Delete a custom preset",
    description="Permanently deletes a custom tone preset. Built-in presets cannot be deleted and return `409`.",
    response_description="No content",
    responses={
        204: {"description": "Preset deleted"},
        404: {"description": "Preset not found"},
        409: {"description": "Cannot delete a built-in preset"},
    },
)
async def delete_preset(name: str):
    name = normalize_preset_name(name)
    if name in _BUILTIN:
        raise HTTPException(status_code=409, detail=f"'{name}' is a built-in preset and cannot be deleted.")
    db = await get_db()
    async with db.execute("DELETE FROM user_presets WHERE name = ?", (name,)) as cur:
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
    await db.commit()
