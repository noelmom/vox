import base64
import io
import json
import sqlite3
import zipfile
from pathlib import Path

import pytest
from fastapi import HTTPException

from api.core.data_safety import (
    canonical_voice_slug,
    decode_voice_icon,
    managed_path,
    stored_managed_path,
    stream_upload,
    validate_backup_members,
)
from api.routers import backups


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
    png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x20\x00\x00\x00\x20" + b"payload"
    encoded = base64.b64encode(png).decode()
    assert decode_voice_icon(f"data:image/png;base64,{encoded}", max_bytes=100) == png
    with pytest.raises(HTTPException):
        decode_voice_icon("data:image/jpeg;base64,ZmFrZQ==", max_bytes=100)
    with pytest.raises(HTTPException):
        decode_voice_icon(f"data:image/png;base64,{encoded}", max_bytes=4)


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
    restored_db.write_bytes(b"new-database")
    restored_voices = transaction / "restored-voices"
    restored_voices.mkdir()
    (restored_voices / "new.wav").write_bytes(b"new-voice")

    monkeypatch.setattr(backups.settings, "db_path", current_db)
    monkeypatch.setattr(backups.settings, "voice_dir", current_voices)

    async def no_op():
        return None

    monkeypatch.setattr(backups.db_core, "disconnect", no_op)
    monkeypatch.setattr(backups.db_core, "connect", no_op)

    await backups._commit_restore(restored_db, restored_voices, transaction)

    assert current_db.read_bytes() == b"new-database"
    assert (current_voices / "new.wav").read_bytes() == b"new-voice"
    assert (tmp_path / ".env").read_text() == "VOX_HOST=127.0.0.1\n"
    assert (outputs / "keep.mp3").read_bytes() == b"generated-audio"
