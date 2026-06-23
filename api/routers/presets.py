from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.core.db import get_db
from api.core.presets import PRESETS

router = APIRouter(prefix="/presets", tags=["presets"])

_BUILTIN = set(PRESETS.keys())


class PresetBody(BaseModel):
    temperature: float = Field(..., ge=0, le=1.5)
    exaggeration: float = Field(..., ge=0, le=1)
    cfg_weight: float = Field(..., ge=0, le=1)
    repetition_penalty: float = Field(..., ge=1, le=2)
    top_p: float = Field(..., ge=0, le=1)
    min_p: float = Field(..., ge=0, le=1)


@router.post("/{name}", status_code=204)
async def save_preset(name: str, body: PresetBody):
    if name.lower() in _BUILTIN:
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


@router.delete("/{name}", status_code=204)
async def delete_preset(name: str):
    if name.lower() in _BUILTIN:
        raise HTTPException(status_code=409, detail=f"'{name}' is a built-in preset and cannot be deleted.")
    db = await get_db()
    async with db.execute("DELETE FROM user_presets WHERE name = ?", (name,)) as cur:
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
    await db.commit()
