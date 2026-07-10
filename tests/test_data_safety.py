import base64
import io
import json
import sqlite3
import zipfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import soundfile as sf
from fastapi import HTTPException
from PIL import Image

from api.core import cleanup, watcher
from api.core.data_safety import (
    canonical_voice_slug,
    decode_voice_icon,
    managed_path,
    stored_managed_path,
    stream_upload,
    validate_backup_members,
)
from api.routers import backups
from api.routers import jobs as jobs_router


def test_voice_slug_is_ascii_canonical_and_cannot_be_empty():
    assert canonical_voice_slug("  Héllo / ../../World  ") == "hello-world"
    assert canonical_voice_slug("My___Voice---2") == "my-voice-2"
    with pytest.raises(HTTPException):
        canonical_voice_slug("../../")


def test_managed_path_rejects_escape_and_symlink_escape(tmp_path):
    root = tmp_path / "voices"
    root.mkdir()
    assert managed_path(root, "safe.wav") == root / "safe.wav"
    with pytest.raises(HTTPException):
        managed_path(root, "../outside.wav")

    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(HTTPException):
        managed_path(root, "link/escape.wav")
    with pytest.raises(HTTPException):
        stored_managed_path(root, str(tmp_path / "outside.wav"))


def test_voice_icon_requires_a_bounded_png_data_url():
    output = io.BytesIO()
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(output, format="PNG")
    png = output.getvalue()
    encoded = base64.b64encode(png).decode()
    assert decode_voice_icon(f"data:image/png;base64,{encoded}", max_bytes=100) == png
    with pytest.raises(HTTPException):
        decode_voice_icon("data:image/jpeg;base64,ZmFrZQ==", max_bytes=100)
    with pytest.raises(HTTPException):
        decode_voice_icon(f"data:image/png;base64,{encoded}", max_bytes=4)
    truncated = base64.b64encode(png[:32]).decode()
    with pytest.raises(HTTPException):
        decode_voice_icon(f"data:image/png;base64,{truncated}", max_bytes=100)


def _archive(entries: dict[str, bytes]) -> zipfile.ZipFile:
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in entries.items():
            archive.writestr(name, value)
    payload.seek(0)
    return zipfile.ZipFile(payload)


def test_backup_members_reject_traversal_and_required_file_duplicates():
    with _archive({"../escape": b"x"}) as archive, pytest.raises(HTTPException):
        validate_backup_members(archive)

    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("manifest.json", b"{}")
        archive.writestr("manifest.json", b"{}")
        archive.writestr("data/vox.db", b"db")
    payload.seek(0)
    with zipfile.ZipFile(payload) as archive, pytest.raises(HTTPException):
        validate_backup_members(archive)


def test_backup_members_enforce_entry_and_expanded_size_limits():
    with _archive({"manifest.json": b"{}", "data/vox.db": b"12345"}) as archive:
        with pytest.raises(HTTPException):
            validate_backup_members(archive, max_expanded_bytes=4)

    with _archive({"manifest.json": b"{}", "data/vox.db": b"db", "voices/a.wav": b"a"}) as archive:
        with pytest.raises(HTTPException):
            validate_backup_members(archive, max_entries=2)


def test_backup_manifest_and_database_schema_are_strict(tmp_path):
    with _archive({
        "manifest.json": json.dumps({"app": "Vox", "backup_version": 999, "includes": ["data/vox.db", "voices"]}).encode(),
        "data/vox.db": b"db",
    }) as archive, pytest.raises(HTTPException):
        backups._validate_manifest(archive)

    database_path = tmp_path / "incomplete.db"
    database = sqlite3.connect(database_path)
    database.execute("CREATE TABLE voices (id TEXT, name TEXT, filename TEXT, status TEXT)")
    database.close()
    with pytest.raises(HTTPException):
        backups._validate_database(database_path)


def test_backup_database_rejects_a_malformed_restored_icon(tmp_path, monkeypatch):
    voice_root = tmp_path / "voices"
    voice_root.mkdir()
    (voice_root / "safe.wav").write_bytes(b"voice")
    monkeypatch.setattr(backups.settings, "voice_dir", voice_root)
    monkeypatch.setattr(backups.settings, "output_dir", tmp_path / "outputs")

    database_path = tmp_path / "backup.db"
    database = sqlite3.connect(database_path)
    database.executescript(
        """
        CREATE TABLE voices (id TEXT, name TEXT, filename TEXT, status TEXT, icon_data TEXT);
        CREATE TABLE jobs (request_id TEXT, status TEXT, text TEXT, created_at TEXT, output_path TEXT);
        CREATE TABLE user_presets (name TEXT, temperature REAL);
        CREATE TABLE meta (key TEXT, value TEXT);
        CREATE TABLE user_preferences (key TEXT, value TEXT);
        """
    )
    malformed = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\ntruncated").decode()
    database.execute(
        "INSERT INTO voices VALUES ('1', 'safe', 'safe.wav', 'active', ?)",
        (malformed,),
    )
    database.commit()
    database.close()

    with pytest.raises(HTTPException):
        backups._validate_database(database_path, voice_root)


@pytest.mark.asyncio
async def test_stream_upload_removes_partial_file_when_limit_is_exceeded(tmp_path):
    from starlette.datastructures import UploadFile

    upload = UploadFile(filename="large.wav", file=io.BytesIO(b"123456"))
    destination = tmp_path / "voice.wav"
    with pytest.raises(HTTPException) as exc:
        await stream_upload(upload, destination, max_bytes=4)
    assert exc.value.status_code == 413
    assert not destination.exists()


@pytest.mark.asyncio
async def test_restore_transaction_rolls_back_database_and_voices_on_connect_failure(tmp_path, monkeypatch):
    current_db = tmp_path / "data" / "vox.db"
    current_db.parent.mkdir()
    current_db.write_bytes(b"prior-database")
    current_wal = Path(f"{current_db}-wal")
    current_wal.write_bytes(b"prior-wal")
    current_voices = tmp_path / "voices"
    current_voices.mkdir()
    (current_voices / "prior.wav").write_bytes(b"prior-voice")

    transaction = tmp_path / "transaction"
    transaction.mkdir()
    restored_db = transaction / "restored.db"
    restored_db.write_bytes(b"new-database")
    restored_voices = transaction / "restored-voices"
    restored_voices.mkdir()
    (restored_voices / "new.wav").write_bytes(b"new-voice")

    monkeypatch.setattr(backups.settings, "db_path", current_db)
    monkeypatch.setattr(backups.settings, "voice_dir", current_voices)

    async def disconnect():
        return None

    connect_attempts = 0

    async def connect():
        nonlocal connect_attempts
        connect_attempts += 1
        if connect_attempts == 1:
            raise RuntimeError("injected restored database failure")

    monkeypatch.setattr(backups.db_core, "disconnect", disconnect)
    monkeypatch.setattr(backups.db_core, "connect", connect)

    with pytest.raises(HTTPException) as exc:
        await backups._commit_restore(restored_db, restored_voices, transaction)

    assert exc.value.status_code == 500
    assert current_db.read_bytes() == b"prior-database"
    assert current_wal.read_bytes() == b"prior-wal"
    assert (current_voices / "prior.wav").read_bytes() == b"prior-voice"
    assert not (current_voices / "new.wav").exists()


@pytest.mark.asyncio
async def test_restore_transaction_preserves_unrelated_runtime_data(tmp_path, monkeypatch):
    current_db = tmp_path / "data" / "vox.db"
    current_db.parent.mkdir()
    current_db.write_bytes(b"prior-database")
    current_voices = tmp_path / "voices"
    current_voices.mkdir()
    (current_voices / "prior.wav").write_bytes(b"prior-voice")
    (tmp_path / ".env").write_text("VOX_HOST=127.0.0.1\n")
    outputs = tmp_path / "outputs"
    outputs.mkdir()
    (outputs / "keep.mp3").write_bytes(b"generated-audio")

    transaction = tmp_path / "transaction-success"
    transaction.mkdir()
    restored_db = transaction / "restored.db"
    restored_database = sqlite3.connect(restored_db)
    restored_database.execute(
        "CREATE TABLE user_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    restored_database.execute(
        "INSERT INTO user_preferences VALUES ('vox:theme', '\"backup-theme\"', '2020-01-01')"
    )
    restored_database.commit()
    restored_database.close()
    restored_voices = transaction / "restored-voices"
    restored_voices.mkdir()
    (restored_voices / "new.wav").write_bytes(b"new-voice")

    monkeypatch.setattr(backups.settings, "db_path", current_db)
    monkeypatch.setattr(backups.settings, "voice_dir", current_voices)

    async def no_op():
        return None

    monkeypatch.setattr(backups.db_core, "disconnect", no_op)
    monkeypatch.setattr(backups.db_core, "connect", no_op)

    await backups._commit_restore(
        restored_db,
        restored_voices,
        transaction,
        preserved_preferences=[("vox:theme", '"current-theme"', "2026-07-10")],
    )

    current_database = sqlite3.connect(current_db)
    assert current_database.execute("SELECT value FROM user_preferences WHERE key='vox:theme'").fetchone()[0] == '"current-theme"'
    current_database.close()
    assert (current_voices / "new.wav").read_bytes() == b"new-voice"
    assert (tmp_path / ".env").read_text() == "VOX_HOST=127.0.0.1\n"
    assert (outputs / "keep.mp3").read_bytes() == b"generated-audio"


@pytest.mark.asyncio
async def test_watcher_restores_source_and_prior_voice_when_registration_fails(tmp_path, monkeypatch):
    input_dir = tmp_path / "input"
    (input_dir / "processed").mkdir(parents=True)
    voice_dir = tmp_path / "voices"
    voice_dir.mkdir()
    source = input_dir / "existing.wav"
    sf.write(source, np.zeros(2400, dtype=np.float32), 24000)
    prior_voice = voice_dir / "existing.wav"
    prior_voice.write_bytes(b"prior-voice")

    monkeypatch.setattr(watcher.settings, "input_dir", input_dir)
    monkeypatch.setattr(watcher.settings, "voice_dir", voice_dir)

    async def get_db():
        return object()

    async def fail_registration(**_kwargs):
        raise RuntimeError("injected database failure")

    import api.routers.voices as voices

    monkeypatch.setattr(watcher, "get_db", get_db)
    monkeypatch.setattr(voices, "_register_voice", fail_registration)

    await watcher._ingest_file(source)

    assert source.exists()
    assert prior_voice.read_bytes() == b"prior-voice"
    assert not list((input_dir / "processed").iterdir())


@pytest.mark.asyncio
async def test_watcher_rejects_an_input_symlink(tmp_path, monkeypatch):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    external = tmp_path / "external.wav"
    sf.write(external, np.zeros(2400, dtype=np.float32), 24000)
    symlink = input_dir / "linked.wav"
    symlink.symlink_to(external)
    monkeypatch.setattr(watcher.settings, "input_dir", input_dir)

    with pytest.raises(ValueError, match="symbolic links"):
        await watcher._ingest_file(symlink)


@pytest.mark.asyncio
async def test_job_delete_restores_audio_when_database_commit_fails(tmp_path, monkeypatch):
    output_dir = tmp_path / "outputs"
    output_dir.mkdir()
    output = output_dir / "job.mp3"
    output.write_bytes(b"audio")

    class Cursor:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def fetchone(self):
            return {"output_path": str(output)}

        def __await__(self):
            async def result():
                return self

            return result().__await__()

    class FailingDatabase:
        def execute(self, *_args):
            return Cursor()

        async def commit(self):
            raise RuntimeError("injected commit failure")

        async def rollback(self):
            return None

    async def get_db():
        return FailingDatabase()

    monkeypatch.setattr(jobs_router, "get_db", get_db)
    monkeypatch.setattr(jobs_router.settings, "output_dir", output_dir)

    with pytest.raises(RuntimeError, match="injected commit failure"):
        await jobs_router.delete_job("job-1", SimpleNamespace())

    assert output.read_bytes() == b"audio"
    assert not list(output_dir.glob(".deleting-*"))


@pytest.mark.asyncio
async def test_deleted_voice_cleanup_leaves_files_when_database_commit_fails(tmp_path, monkeypatch):
    voice_dir = tmp_path / "voices"
    deleted_dir = voice_dir / "deleted"
    deleted_dir.mkdir(parents=True)
    voice_file = deleted_dir / "old.wav"
    sidecar = deleted_dir / "old.json"
    voice_file.write_bytes(b"voice")
    sidecar.write_text("{}")

    class Cursor:
        def __init__(self, rows):
            self.rows = rows

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def fetchall(self):
            return self.rows

        def __await__(self):
            async def result():
                return self

            return result().__await__()

    class FailingDatabase:
        def execute(self, query, _params=()):
            if "output_path FROM jobs" in query:
                return Cursor([])
            if "FROM voices" in query:
                return Cursor([{"id": "voice-1", "name": "old", "filename": "old.wav"}])
            return Cursor([])

        async def commit(self):
            raise RuntimeError("injected commit failure")

        async def rollback(self):
            return None

    async def get_db():
        return FailingDatabase()

    monkeypatch.setattr(cleanup, "get_db", get_db)
    monkeypatch.setattr(cleanup.settings, "voice_dir", voice_dir)
    monkeypatch.setattr(cleanup.settings, "output_dir", tmp_path / "outputs")
    cleanup.settings.output_dir.mkdir()
    monkeypatch.setattr(cleanup.settings, "output_ttl_hours", 0)
    monkeypatch.setattr(cleanup.settings, "job_retention_days", 0)
    monkeypatch.setattr(cleanup.settings, "deleted_voice_ttl_hours", 1)

    await cleanup._run_cleanup()

    assert voice_file.read_bytes() == b"voice"
    assert sidecar.read_text() == "{}"
