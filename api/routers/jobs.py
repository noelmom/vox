from fastapi import APIRouter, HTTPException, Request

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
