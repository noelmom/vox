from fastapi import APIRouter, Query
from fastapi import HTTPException

from api.core.db import get_db
router = APIRouter(prefix="/logs", tags=["system"])

_LOG_FILES = {
    "server": "vox.log",
    "server-error": "vox-error.log",
    "helper": "vox-helper.log",
    "helper-error": "vox-helper-error.log",
    "install": "install.log",
}


@router.get(
    "",
    summary="Query generation log data",
    description="Returns structured generation/job history with optional filters. This is backed by SQLite job rows, not raw log-file text.",
)
async def list_logs(
    request_id: str | None = None,
    status: str | None = None,
    preset: str | None = None,
    voice: str | None = None,
    user_agent: str | None = None,
    date_from: str | None = Query(None, description="Inclusive lower bound for jobs.created_at, e.g. 2026-06-28 or 2026-06-28T12:00:00"),
    date_to: str | None = Query(None, description="Inclusive upper bound for jobs.created_at, e.g. 2026-06-28 or 2026-06-28T23:59:59"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    db = await get_db()
    clauses = []
    params: list[object] = []

    if request_id:
        clauses.append("j.request_id = ?")
        params.append(request_id)
    if status:
        clauses.append("j.status = ?")
        params.append(status)
    if preset:
        clauses.append("j.preset = ?")
        params.append(preset.lower())
    if voice:
        clauses.append("v.name = ?")
        params.append(voice)
    if user_agent:
        clauses.append("j.user_agent LIKE ?")
        params.append(f"%{user_agent}%")
    if date_from:
        clauses.append("j.created_at >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("j.created_at <= ?")
        params.append(date_to)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.extend([limit, offset])

    async with db.execute(
        f"""
        SELECT
            j.request_id,
            j.status,
            j.preset,
            j.output_format,
            j.chunks,
            j.audio_duration_s,
            j.generation_s,
            j.encode_s,
            j.total_s,
            j.rtf,
            j.device,
            j.user_agent,
            j.error,
            j.created_at,
            j.completed_at,
            v.name AS voice_name
        FROM jobs j
        LEFT JOIN voices v ON v.id = j.voice_id
        {where}
        ORDER BY j.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params,
    ) as cur:
        rows = await cur.fetchall()

    return [dict(row) for row in rows]


@router.get(
    "/files/{name}",
    summary="Read a bounded Vox log tail",
    description="Returns the last N lines from a known Vox log file. Only predefined log names are accepted.",
)
async def read_log_file(name: str, lines: int = Query(200, ge=1, le=1000)):
    filename = _LOG_FILES.get(name)
    if not filename:
        raise HTTPException(status_code=404, detail="Log file not found")

    from pathlib import Path

    path = Path.home() / "Library" / "Logs" / "Vox" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Log file not found")

    text_lines = path.read_text(errors="replace").splitlines()
    return {
        "name": name,
        "path": str(path),
        "lines": text_lines[-lines:],
    }
