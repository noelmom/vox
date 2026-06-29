import io
import json
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from api.core import db as db_core
from api.core.config import settings
from api.core.db import get_db
from api.core.validation import validate_upload_size

router = APIRouter(prefix="/backups", tags=["backups"])

BACKUP_VERSION = 1


class RestoreOut(BaseModel):
    restored: bool
    voices_restored: int
    message: str


def _safe_zip_path(name: str) -> Path:
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=400, detail="Backup contains an unsafe path")
    return path


def _write_tree(zf: zipfile.ZipFile, source: Path, prefix: str):
    if not source.exists():
        return
    for path in source.rglob("*"):
        if path.is_file():
            zf.write(path, f"{prefix}/{path.relative_to(source)}")


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

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
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
            zf.write(tmp_db, "data/vox.db")
            _write_tree(zf, settings.voice_dir, "voices")

    buffer.seek(0)
    filename = f"Vox-Backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/restore",
    response_model=RestoreOut,
    summary="Restore a Vox backup",
    description="Restores a backup created by `GET /api/v1/backups/export`. This replaces the current database and voice assets.",
)
async def restore_backup(file: UploadFile = File(...)):
    payload = validate_upload_size(await file.read(), "Backup")

    with tempfile.TemporaryDirectory(prefix="vox-restore-") as tmp_dir:
        restore_root = Path(tmp_dir) / "restore"
        restore_root.mkdir()

        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                for member in zf.namelist():
                    _safe_zip_path(member)
                if "manifest.json" not in zf.namelist() or "data/vox.db" not in zf.namelist():
                    raise HTTPException(status_code=400, detail="Backup is missing required Vox files")

                manifest = json.loads(zf.read("manifest.json"))
                if manifest.get("app") != "Vox":
                    raise HTTPException(status_code=400, detail="Backup was not created by Vox")

                zf.extractall(restore_root)
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Backup file is not a valid zip") from exc
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Backup manifest is invalid") from exc

        restored_db = restore_root / "data" / "vox.db"
        try:
            probe = sqlite3.connect(restored_db)
            try:
                probe.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='voices'")
                probe.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'")
            finally:
                probe.close()
        except sqlite3.DatabaseError as exc:
            raise HTTPException(status_code=400, detail="Backup database is invalid") from exc

        restored_voices = restore_root / "voices"
        voice_count = len(list(restored_voices.glob("*.wav"))) if restored_voices.exists() else 0

        await db_core.disconnect()
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(restored_db, settings.db_path)

        if restored_voices.exists():
            if settings.voice_dir.exists():
                shutil.rmtree(settings.voice_dir)
            shutil.copytree(restored_voices, settings.voice_dir)
        settings.voice_dir.mkdir(parents=True, exist_ok=True)
        (settings.voice_dir / "deleted").mkdir(exist_ok=True)

        await db_core.connect()

    return RestoreOut(
        restored=True,
        voices_restored=voice_count,
        message="Backup restored. Refresh Vox Studio to see the latest library and voice profile data.",
    )
