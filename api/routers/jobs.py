from pathlib import Path

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


@router.get("", response_model=list[JobOut])
async def list_jobs(request: Request, limit: int = 50, offset: int = 0):
    db = await get_db()
    async with db.execute(
        f"{_JOB_SELECT} ORDER BY j.created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/{request_id}", response_model=JobOut)
async def get_job(request_id: str, request: Request):
    db = await get_db()
    async with db.execute(f"{_JOB_SELECT} WHERE j.request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(row)


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
