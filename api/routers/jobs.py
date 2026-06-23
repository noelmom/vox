from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from api.core.db import get_db
from api.models.job import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


_JOB_SELECT = """
    SELECT j.*, v.name AS voice_name
    FROM jobs j
    LEFT JOIN voices v ON v.id = j.voice_id
"""


def _annotate(row: Any) -> dict:
    d = dict(row)
    p = d.get("output_path")
    d["file_available"] = bool(p and Path(p).exists())
    return d


@router.get("", response_model=list[JobOut])
async def list_jobs(request: Request, limit: int = 50, offset: int = 0):
    db = await get_db()
    async with db.execute(
        f"{_JOB_SELECT} ORDER BY j.created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ) as cur:
        rows = await cur.fetchall()
    return [_annotate(r) for r in rows]


@router.get("/{request_id}", response_model=JobOut)
async def get_job(request_id: str, request: Request):
    db = await get_db()
    async with db.execute(f"{_JOB_SELECT} WHERE j.request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return _annotate(row)


@router.delete("/{request_id}", status_code=204)
async def delete_job(request_id: str, request: Request):
    db = await get_db()
    async with db.execute("SELECT output_path FROM jobs WHERE request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.execute("DELETE FROM jobs WHERE request_id = ?", (request_id,))
    await db.commit()
    if row["output_path"]:
        p = Path(row["output_path"])
        if p.exists():
            p.unlink(missing_ok=True)


@router.get("/{request_id}/audio")
async def get_job_audio(request_id: str, request: Request):
    db = await get_db()
    async with db.execute(
        "SELECT status, output_path, output_format, error FROM jobs WHERE request_id = ?",
        (request_id,),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    if row["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {row['status']}")
    output_path = Path(row["output_path"])
    if not output_path.exists():
        raise HTTPException(status_code=410, detail="Audio file no longer exists (expired or deleted)")
    media_type = "audio/mpeg" if row["output_format"] == "mp3" else "audio/wav"
    return FileResponse(str(output_path), media_type=media_type)
