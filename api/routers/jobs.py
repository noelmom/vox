import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from api.core.db import get_db
from api.models.job import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


_JOB_SELECT = """
    SELECT
        j.*,
        v.name AS voice_name,
        CASE
            WHEN j.status = 'processing' THEN 0
            WHEN j.status = 'queued' THEN (
                SELECT COUNT(*)
                FROM jobs q
                WHERE q.status IN ('queued', 'processing')
                  AND (
                      datetime(q.created_at) < datetime(j.created_at)
                      OR (datetime(q.created_at) = datetime(j.created_at) AND q.request_id <= j.request_id)
                  )
            )
            ELSE NULL
        END AS queue_position
    FROM jobs j
    LEFT JOIN voices v ON v.id = j.voice_id
"""


def _annotate(row: Any) -> dict:
    d = dict(row)
    p = d.get("output_path")
    d["file_available"] = bool(p and Path(p).exists())
    return d


async def _get_job_row(request_id: str) -> dict | None:
    db = await get_db()
    async with db.execute(f"{_JOB_SELECT} WHERE j.request_id = ?", (request_id,)) as cur:
        row = await cur.fetchone()
    return _annotate(row) if row else None


@router.get(
    "",
    response_model=list[JobOut],
    summary="List generation jobs",
    description="Returns recent TTS jobs in descending creation order. Supports cursor-style pagination via `limit` and `offset`. Each job includes timing metrics (`generation_s`, `audio_duration_s`, `rtf`) once completed.",
    response_description="Array of job objects",
)
async def list_jobs(request: Request, limit: int = 50, offset: int = 0):
    db = await get_db()
    async with db.execute(
        f"{_JOB_SELECT} ORDER BY j.created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ) as cur:
        rows = await cur.fetchall()
    return [_annotate(r) for r in rows]


@router.get(
    "/{request_id}/events",
    summary="Stream job status events",
    description="Streams server-sent events for a single job. The `job` event payload matches `GET /api/v1/jobs/{request_id}` and is emitted whenever the job row changes until it reaches a terminal state.",
    response_description="Server-sent event stream",
    responses={404: {"description": "Job not found"}},
)
async def stream_job_events(request_id: str, request: Request):
    initial = await _get_job_row(request_id)
    if not initial:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        last_payload = ""
        while not await request.is_disconnected():
            job = await _get_job_row(request_id)
            if not job:
                yield "event: deleted\ndata: {}\n\n"
                return

            payload = json.dumps(job, default=str)
            if payload != last_payload:
                yield f"event: job\ndata: {payload}\n\n"
                last_payload = payload

            if job["status"] in {"completed", "failed", "cancelled"}:
                return

            await asyncio.sleep(0.75)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get(
    "/{request_id}",
    response_model=JobOut,
    summary="Get job status",
    description="""Poll this endpoint after `POST /api/v1/tts` to track generation progress.

**Status values**

| Status | Meaning |
|---|---|
| `queued` | Job is waiting — another generation may be in progress |
| `processing` | Model is actively generating audio |
| `completed` | Audio is ready — download via `GET /api/v1/jobs/{request_id}/audio` |
| `failed` | Generation failed — see the `error` field for the reason |
| `cancelled` | Generation was stopped by the user |

Typical generation time on Apple Silicon is 1–5× real-time depending on text length and voice complexity.
""",
    response_description="Job object with current status and timing metrics",
    responses={404: {"description": "Job not found"}},
)
async def get_job(request_id: str, request: Request):
    job = await _get_job_row(request_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete(
    "/{request_id}",
    status_code=204,
    summary="Delete a job and its audio",
    description="Deletes the job record and its associated audio file from disk. Useful for freeing storage before the automatic TTL cleanup runs.",
    response_description="No content",
    responses={404: {"description": "Job not found"}},
)
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


@router.get(
    "/{request_id}/audio",
    summary="Download generated audio",
    description="Stream the generated MP3 or WAV file for a completed job. Returns `409` if the job is not yet complete, and `410` if the file has already been cleaned up (output TTL expired or manually deleted).",
    response_description="MP3 or WAV audio stream",
    responses={
        404: {"description": "Job not found"},
        409: {"description": "Job is not yet completed"},
        410: {"description": "Audio file has expired or been deleted"},
    },
)
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
