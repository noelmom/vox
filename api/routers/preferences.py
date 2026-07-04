import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.core.db import get_db

router = APIRouter(prefix="/preferences", tags=["system"])


class PreferencesPatch(BaseModel):
    preferences: dict[str, Any]


def _decode_value(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


@router.get(
    "",
    summary="List UI preferences",
    description="Returns server-persisted Vox Studio UI preferences as a JSON object. Values are stored as JSON so booleans, strings, numbers, arrays, and objects round-trip safely.",
)
async def get_preferences(request: Request):
    db = await get_db()
    async with db.execute("SELECT key, value FROM user_preferences ORDER BY key") as cur:
        rows = await cur.fetchall()
    return {row["key"]: _decode_value(row["value"]) for row in rows}


@router.patch(
    "",
    summary="Update UI preferences",
    description="Upserts one or more Vox Studio UI preferences. Passing `null` deletes that preference key.",
)
async def patch_preferences(payload: PreferencesPatch, request: Request):
    if len(payload.preferences) > 100:
        raise HTTPException(status_code=422, detail="Too many preference keys in one request.")

    db = await get_db()
    for key, value in payload.preferences.items():
        clean_key = key.strip()
        if not clean_key or len(clean_key) > 120:
            raise HTTPException(status_code=422, detail=f"Invalid preference key: {key!r}")
        if not clean_key.startswith("vox:"):
            raise HTTPException(status_code=422, detail=f"Preference key must start with 'vox:': {clean_key}")

        if value is None:
            await db.execute("DELETE FROM user_preferences WHERE key = ?", (clean_key,))
            continue

        try:
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        except TypeError as exc:
            raise HTTPException(status_code=422, detail=f"Preference '{clean_key}' is not JSON serializable.") from exc
        if len(encoded.encode("utf-8")) > 16_384:
            raise HTTPException(status_code=422, detail=f"Preference '{clean_key}' is too large.")

        await db.execute(
            """INSERT INTO user_preferences (key, value, updated_at)
               VALUES (?, ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET
                   value=excluded.value,
                   updated_at=datetime('now')""",
            (clean_key, encoded),
        )
    await db.commit()
    return {"ok": True}
