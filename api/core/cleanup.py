"""
Cleanup routine for generated output files and old job rows.
Runs once at startup then on a configurable interval.
"""
import asyncio
import time
from pathlib import Path

from api.core.config import settings
from api.core.db import get_db
from api.core.logger import get_logger

log = get_logger(__name__)


async def _run_cleanup():
    db = await get_db()

    if settings.output_ttl_hours != 0:
        cutoff = time.time() - (settings.output_ttl_hours * 3600)

        async with db.execute(
            "SELECT request_id, output_path FROM jobs WHERE status='completed' AND output_path IS NOT NULL"
        ) as cur:
            rows = await cur.fetchall()

        deleted = 0
        for row in rows:
            path = Path(row["output_path"])
            if path.exists() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                # Also clean up the paired WAV if we stored an MP3
                wav_sibling = path.with_suffix(".wav")
                wav_sibling.unlink(missing_ok=True)
                deleted += 1

        if deleted:
            log.info("Cleanup: removed %d expired output file(s) (TTL=%dh)", deleted, settings.output_ttl_hours)

    if settings.job_retention_days != 0:
        terminal_statuses = ("'completed', 'failed', 'cancelled'" if settings.output_ttl_hours != 0 else "'failed', 'cancelled'")
        cursor = await db.execute(
            f"""DELETE FROM jobs
               WHERE created_at < datetime('now', ?)
                 AND status IN ({terminal_statuses})""",
            (f"-{settings.job_retention_days} days",),
        )
        await db.commit()
        if cursor.rowcount and cursor.rowcount > 0:
            log.info("Cleanup: pruned %d old job row(s) (retention=%dd)", cursor.rowcount, settings.job_retention_days)

    if settings.deleted_voice_ttl_hours != 0:
        async with db.execute(
            """SELECT id, name, filename FROM voices
               WHERE status='deleted'
                 AND deleted_at IS NOT NULL
                 AND deleted_at < datetime('now', ?)""",
            (f"-{settings.deleted_voice_ttl_hours} hours",),
        ) as cur:
            rows = await cur.fetchall()

        purged = 0
        deleted_dir = settings.voice_dir / "deleted"
        for row in rows:
            path = deleted_dir / row["filename"]
            path.unlink(missing_ok=True)
            path.with_suffix(".json").unlink(missing_ok=True)
            await db.execute("DELETE FROM voices WHERE id = ?", (row["id"],))
            purged += 1

        if purged:
            await db.commit()
            log.info(
                "Cleanup: purged %d deleted voice profile(s) (TTL=%dh)",
                purged,
                settings.deleted_voice_ttl_hours,
            )


async def run_cleanup_loop():
    log.info(
        "Cleanup task started (output TTL=%dh, job retention=%dd, deleted voice TTL=%dh, interval=%ds)",
        settings.output_ttl_hours,
        settings.job_retention_days,
        settings.deleted_voice_ttl_hours,
        settings.cleanup_interval_s,
    )
    await _run_cleanup()  # run immediately on startup
    while True:
        await asyncio.sleep(settings.cleanup_interval_s)
        await _run_cleanup()
