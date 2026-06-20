"""
Cleanup routine for generated output files.
Deletes files older than VOX_OUTPUT_TTL_HOURS (default 24h).
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
    if settings.output_ttl_hours == 0:
        return

    cutoff = time.time() - (settings.output_ttl_hours * 3600)
    db = await get_db()

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


async def run_cleanup_loop():
    log.info(
        "Cleanup task started (TTL=%dh, interval=%ds)",
        settings.output_ttl_hours,
        settings.cleanup_interval_s,
    )
    await _run_cleanup()  # run immediately on startup
    while True:
        await asyncio.sleep(settings.cleanup_interval_s)
        await _run_cleanup()
