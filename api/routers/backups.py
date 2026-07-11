import asyncio
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from api.core import db as db_core
from api.core.config import settings
from api.core.data_safety import (
    canonical_voice_slug,
    decode_voice_icon,
    managed_path,
    stored_managed_path,
    stream_upload,
    validate_backup_members,
)
from api.core.db import get_db

router = APIRouter(prefix="/backups", tags=["backups"])

BACKUP_VERSION = 1
_RESTORE_LOCK = asyncio.Lock()
_REQUIRED_SCHEMA = {
    "voices": {"id", "name", "filename", "status"},
    "jobs": {"request_id", "status", "text", "created_at"},
    "user_presets": {"name", "temperature"},
    "meta": {"key", "value"},
    "user_preferences": {"key", "value", "updated_at"},
}


class RestoreOut(BaseModel):
    restored: bool
    voices_restored: int
    message: str


def _write_tree(archive: zipfile.ZipFile, source: Path, prefix: str) -> None:
    if not source.exists():
        return
    for path in source.rglob("*"):
        if path.is_file() and not path.is_symlink():
            archive.write(path, f"{prefix}/{path.relative_to(source)}")


def _validate_manifest(archive: zipfile.ZipFile) -> dict:
    try:
        manifest = json.loads(archive.read("manifest.json"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Backup manifest is invalid.") from exc
    if manifest.get("app") != "Vox" or manifest.get("backup_version") != BACKUP_VERSION:
        raise HTTPException(status_code=400, detail="Backup version is not supported by this Vox build.")
    includes = manifest.get("includes")
    if not isinstance(includes, list) or not {"data/vox.db", "voices"}.issubset(includes):
        raise HTTPException(status_code=400, detail="Backup manifest does not describe the required Vox data.")
    return manifest


def _validate_database(path: Path, voice_root: Path | None = None) -> None:
    try:
        database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise HTTPException(status_code=400, detail="Backup database failed its integrity check.")
            for table, required_columns in _REQUIRED_SCHEMA.items():
                table_info = list(database.execute(f'PRAGMA table_info("{table}")'))
                columns = {row[1] for row in table_info}
                if not required_columns <= columns:
                    raise HTTPException(status_code=400, detail=f"Backup database is missing required {table} fields.")
                if table == "user_preferences":
                    primary_key = [(row[5], row[1]) for row in table_info if row[5] > 0]
                    if primary_key != [(1, "key")]:
                        raise HTTPException(status_code=400, detail="Backup preferences table must use key as its sole primary key.")
            if database.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise HTTPException(status_code=400, detail="Backup database contains invalid references.")
            if database.execute("SELECT 1 FROM sqlite_master WHERE type IN ('trigger', 'view') LIMIT 1").fetchone():
                raise HTTPException(status_code=400, detail="Backup database contains unsupported executable schema objects.")
            for name, filename, status, icon_data in database.execute("SELECT name, filename, status, icon_data FROM voices"):
                if canonical_voice_slug(name) != name or Path(filename).name != filename or Path(filename).suffix.lower() != ".wav":
                    raise HTTPException(status_code=400, detail="Backup contains a non-canonical voice record.")
                managed_path(settings.voice_dir, filename)
                if voice_root is not None and status == "active" and not managed_path(voice_root, filename).is_file():
                    raise HTTPException(status_code=400, detail="Backup is missing audio for an active voice profile.")
                if icon_data:
                    decode_voice_icon(icon_data, max_bytes=settings.voice_icon_max_kb * 1024)
            for (output_path,) in database.execute("SELECT output_path FROM jobs WHERE output_path IS NOT NULL"):
                stored_managed_path(settings.output_dir, output_path)
        finally:
            database.close()
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=400, detail="Backup database is invalid.") from exc


def _extract_validated(archive: zipfile.ZipFile, destination: Path) -> None:
    members = validate_backup_members(
        archive,
        max_entries=settings.max_backup_entries,
        max_expanded_bytes=settings.max_backup_expanded_mb * 1024 * 1024,
    )
    _validate_manifest(archive)
    for member in members:
        if member.is_dir():
            continue
        target = managed_path(destination, member.filename)
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, target.open("xb") as output:
            shutil.copyfileobj(source, output, length=1024 * 1024)


def _merge_preserved_preferences(restored_db: Path, preferences: list[tuple[str, str, str]]) -> None:
    database = sqlite3.connect(restored_db)
    try:
        database.execute("DELETE FROM user_preferences")
        database.executemany(
            "INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?)",
            preferences,
        )
        database.commit()
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


async def _commit_restore(
    restored_db: Path,
    restored_voices: Path,
    transaction_root: Path,
    preserved_preferences: list[tuple[str, str, str]] | None = None,
) -> None:
    prior_db = transaction_root / "prior-vox.db"
    prior_voices = transaction_root / "prior-voices"
    sidecars = [Path(f"{settings.db_path}-wal"), Path(f"{settings.db_path}-shm")]
    prior_sidecars = [transaction_root / f"prior-{sidecar.name}" for sidecar in sidecars]
    moved_db = False
    moved_voices = False
    moved_sidecars: list[tuple[Path, Path]] = []

    if preserved_preferences is not None:
        _merge_preserved_preferences(restored_db, preserved_preferences)
    await db_core.disconnect()
    try:
        if settings.db_path.exists():
            os.replace(settings.db_path, prior_db)
            moved_db = True
        for sidecar, prior_sidecar in zip(sidecars, prior_sidecars, strict=True):
            if sidecar.exists():
                os.replace(sidecar, prior_sidecar)
                moved_sidecars.append((sidecar, prior_sidecar))
        if settings.voice_dir.exists():
            os.replace(settings.voice_dir, prior_voices)
            moved_voices = True

        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        settings.voice_dir.parent.mkdir(parents=True, exist_ok=True)
        os.replace(restored_db, settings.db_path)
        os.replace(restored_voices, settings.voice_dir)
        (settings.voice_dir / "deleted").mkdir(exist_ok=True)
        await db_core.connect()
    except Exception as exc:
        await db_core.disconnect()
        settings.db_path.unlink(missing_ok=True)
        for sidecar in sidecars:
            sidecar.unlink(missing_ok=True)
        if settings.voice_dir.exists():
            shutil.rmtree(settings.voice_dir)
        if moved_db and prior_db.exists():
            os.replace(prior_db, settings.db_path)
        if moved_voices and prior_voices.exists():
            os.replace(prior_voices, settings.voice_dir)
        for sidecar, prior_sidecar in moved_sidecars:
            if prior_sidecar.exists():
                os.replace(prior_sidecar, sidecar)
        try:
            await db_core.connect()
        except Exception as reconnect_error:
            raise HTTPException(status_code=500, detail="Restore failed and Vox could not reopen the prior database. Restart Vox before retrying.") from reconnect_error
        raise HTTPException(status_code=500, detail="Restore failed; prior Vox data was restored unchanged.") from exc


@router.get(
    "/export",
    summary="Export a Vox backup",
    description="Downloads a zip backup containing the SQLite database and voice assets. Generated output audio is intentionally excluded.",
)
async def export_backup():
    db = await get_db()
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    with tempfile.TemporaryDirectory(prefix="vox-backup-") as tmp_dir:
        tmp_db = Path(tmp_dir) / "vox.db"
        sqlite_target = sqlite3.connect(tmp_db)
        try:
            await db.backup(sqlite_target)
        finally:
            sqlite_target.close()

        archive_path = Path(tmp_dir) / f"Vox-Backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "app": "Vox",
                        "backup_version": BACKUP_VERSION,
                        "created_at": created_at,
                        "includes": ["data/vox.db", "voices"],
                    },
                    indent=2,
                ),
            )
            archive.write(tmp_db, "data/vox.db")
            _write_tree(archive, settings.voice_dir, "voices")
        descriptor, response_name = tempfile.mkstemp(prefix="vox-export-", suffix=".zip")
        os.close(descriptor)
        response_path = Path(response_name)
        shutil.copy2(archive_path, response_path)

    filename = f"Vox-Backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return FileResponse(
        response_path,
        filename=filename,
        media_type="application/zip",
        background=BackgroundTask(response_path.unlink, missing_ok=True),
    )


@router.post(
    "/restore",
    response_model=RestoreOut,
    summary="Restore a Vox backup",
    description="Validates and atomically restores a Vox backup while preserving settings, generated output, and unrelated files.",
)
async def restore_backup(file: UploadFile = File(...)):
    runtime_root = Path(os.path.commonpath((settings.db_path.resolve().parent, settings.voice_dir.resolve().parent)))
    runtime_root.mkdir(parents=True, exist_ok=True)

    async with _RESTORE_LOCK:
        with tempfile.TemporaryDirectory(prefix=".vox-restore-", dir=runtime_root) as tmp_dir:
            transaction_root = Path(tmp_dir)
            upload_path = transaction_root / "upload.zip"
            size = await stream_upload(
                file,
                upload_path,
                max_bytes=settings.max_backup_upload_mb * 1024 * 1024,
            )
            if size == 0:
                raise HTTPException(status_code=400, detail="Backup file is empty.")

            restore_root = transaction_root / "staged"
            restore_root.mkdir()
            try:
                with zipfile.ZipFile(upload_path) as archive:
                    _extract_validated(archive, restore_root)
            except zipfile.BadZipFile as exc:
                raise HTTPException(status_code=400, detail="Backup file is not a valid zip.") from exc

            restored_db = managed_path(restore_root, "data/vox.db")
            restored_voices = managed_path(restore_root, "voices")
            restored_voices.mkdir(exist_ok=True)
            _validate_database(restored_db, restored_voices)
            voice_count = sum(1 for path in restored_voices.glob("*.wav") if path.is_file())

            current_db = await get_db()
            async with current_db.execute("SELECT key, value, updated_at FROM user_preferences") as cursor:
                preserved_preferences = [tuple(row) for row in await cursor.fetchall()]
            await _commit_restore(
                restored_db,
                restored_voices,
                transaction_root,
                preserved_preferences=preserved_preferences,
            )

    return RestoreOut(
        restored=True,
        voices_restored=voice_count,
        message="Backup restored. Refresh Vox Studio to see the restored library and history.",
    )
