"""
Cleanup routine for generated output files and old job rows.
Runs once at startup then on a configurable interval.
"""
import asyncio
import time
import uuid
from pathlib import Path

from api.core.config import settings
from api.core.data_safety import managed_path, stored_managed_path
from api.core.db import get_db
from api.core.logger import get_logger

log = get_logger(__name__)


def _restore_staged_files(staged: list[tuple[Path, Path]]) -> None:
    for original, temporary in reversed(staged):
        if temporary.exists() and not original.exists():
            temporary.replace(original)


def _dispose_staged_files(staged: list[tuple[Path, Path]]) -> None:
    for _, temporary in staged:
        try:
            temporary.unlink(missing_ok=True)
        except OSError as exc:
            log.warning("Staged cleanup file will be retried: %s", exc)


async def _run_cleanup():
    db = await get_db()

    async with db.execute("SELECT output_path FROM jobs WHERE output_path IS NOT NULL") as cur:
        stored_output_rows = await cur.fetchall()
    referenced_outputs = set()
    for row in stored_output_rows:
        try:
            referenced_outputs.add(stored_managed_path(settings.output_dir, row["output_path"]))
        except Exception:
            continue
    for pattern in (".deleting-*--*", ".expired-*--*", ".pruning-*--*"):
        for stale in settings.output_dir.glob(pattern):
            try:
                temporary = managed_path(settings.output_dir, stale.name)
                original_name = stale.name.split("--", 1)[1]
                original = managed_path(settings.output_dir, original_name)
                if original in referenced_outputs and not original.exists():
                    temporary.replace(original)
                elif original not in referenced_outputs:
                    temporary.unlink(missing_ok=True)
            except Exception as exc:
                log.warning("Could not reconcile stale cleanup file %s: %s", stale.name, exc)

    if settings.job_retention_days != 0:
        terminal_statuses = ("'completed', 'failed', 'cancelled', 'interrupted'" if settings.output_ttl_hours != 0 else "'failed', 'cancelled', 'interrupted'")
        async with db.execute(
            f"""SELECT request_id, output_path FROM jobs
               WHERE created_at < datetime('now', ?)
                 AND status IN ({terminal_statuses})""",
            (f"-{settings.job_retention_days} days",),
        ) as cur:
            retention_rows = await cur.fetchall()

        staged_retention_files: list[tuple[Path, Path]] = []
        retention_ids: list[tuple[str]] = []
        try:
            for row in retention_rows:
                path = None
                if row["output_path"]:
                    path = stored_managed_path(settings.output_dir, row["output_path"])
                if path and path.exists():
                    targets = [path]
                    wav_sibling = path.with_suffix(".wav")
                    if wav_sibling != path and wav_sibling.exists():
                        targets.append(wav_sibling)
                    for target in targets:
                        temporary = managed_path(
                            settings.output_dir,
                            f".pruning-{uuid.uuid4()}--{target.name}",
                        )
                        target.replace(temporary)
                        staged_retention_files.append((target, temporary))
                retention_ids.append((row["request_id"],))
            if retention_ids:
                await db.executemany("DELETE FROM jobs WHERE request_id = ?", retention_ids)
                await db.commit()
        except Exception as exc:
            await db.rollback()
            _restore_staged_files(staged_retention_files)
            log.error("Job retention cleanup failed; staged files were restored: %s", exc)
            return
        _dispose_staged_files(staged_retention_files)
        if retention_ids:
            log.info("Cleanup: pruned %d old job row(s) (retention=%dd)", len(retention_ids), settings.job_retention_days)

    if settings.output_ttl_hours != 0:
        cutoff = time.time() - (settings.output_ttl_hours * 3600)

        async with db.execute(
            "SELECT request_id, output_path FROM jobs WHERE status='completed' AND output_path IS NOT NULL"
        ) as cur:
            rows = await cur.fetchall()

        deleted = 0
        for row in rows:
            try:
                path = stored_managed_path(settings.output_dir, row["output_path"])
            except Exception:
                log.error("Skipping cleanup for unsafe stored output path on job %s", row["request_id"])
                continue
            if path.exists() and path.stat().st_mtime < cutoff:
                staged: list[tuple[Path, Path]] = []
                try:
                    targets = [path]
                    wav_sibling = path.with_suffix(".wav")
                    if wav_sibling != path and wav_sibling.exists():
                        targets.append(wav_sibling)
                    for target in targets:
                        temporary = managed_path(
                            settings.output_dir,
                            f".expired-{uuid.uuid4()}--{target.name}",
                        )
                        target.replace(temporary)
                        staged.append((target, temporary))
                except OSError as exc:
                    _restore_staged_files(staged)
                    log.warning("Could not stage expired output for job %s: %s", row["request_id"], exc)
                    continue
                _dispose_staged_files(staged)
                deleted += 1

        if deleted:
            log.info("Cleanup: removed %d expired output file(s) (TTL=%dh)", deleted, settings.output_ttl_hours)

    if settings.deleted_voice_ttl_hours != 0:
        deleted_dir = managed_path(settings.voice_dir, "deleted")
        async with db.execute("SELECT filename FROM voices WHERE status='deleted'") as cur:
            stored_deleted_rows = await cur.fetchall()
        referenced_deleted_names = {row["filename"] for row in stored_deleted_rows}
        for stale in deleted_dir.glob(".voice-purge-*--*"):
            try:
                temporary = managed_path(deleted_dir, stale.name)
                original_name = stale.name.split("--", 1)[1]
                original = managed_path(deleted_dir, original_name)
                voice_filename = str(Path(original_name).with_suffix(".wav").name)
                if voice_filename in referenced_deleted_names and not original.exists():
                    temporary.replace(original)
                elif voice_filename not in referenced_deleted_names:
                    temporary.unlink(missing_ok=True)
            except Exception as exc:
                log.warning("Could not reconcile staged deleted voice file %s: %s", stale.name, exc)

        async with db.execute(
            """SELECT id, name, filename FROM voices
               WHERE status='deleted'
                 AND deleted_at IS NOT NULL
                 AND deleted_at < datetime('now', ?)""",
            (f"-{settings.deleted_voice_ttl_hours} hours",),
        ) as cur:
            rows = await cur.fetchall()

        purged = 0
        for row in rows:
            try:
                path = managed_path(deleted_dir, row["filename"])
            except Exception:
                log.error("Skipping cleanup for unsafe stored voice path on voice %s", row["name"])
                continue
            staged: list[tuple[Path, Path]] = []
            try:
                for target in (path, path.with_suffix(".json")):
                    if not target.exists():
                        continue
                    temporary = managed_path(
                        deleted_dir,
                        f".voice-purge-{uuid.uuid4()}--{target.name}",
                    )
                    target.replace(temporary)
                    staged.append((target, temporary))
                await db.execute("DELETE FROM voices WHERE id = ?", (row["id"],))
                await db.commit()
            except Exception as exc:
                await db.rollback()
                _restore_staged_files(staged)
                log.error("Could not purge voice %s; staged files were restored: %s", row["name"], exc)
                continue
            _dispose_staged_files(staged)
            purged += 1

        if purged:
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
