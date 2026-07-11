from __future__ import annotations

import base64
import binascii
import io
import re
import stat
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

_NON_SLUG = re.compile(r"[^a-z0-9]+")
_PNG_DATA_URL = "data:image/png;base64,"
GENERATION_PARAMETER_BOUNDS = {
    "temperature": (0.0, 1.5),
    "exaggeration": (0.0, 1.0),
    "cfg_weight": (0.0, 1.0),
    "repetition_penalty": (1.0, 2.0),
    "top_p": (0.0, 1.0),
    "min_p": (0.0, 1.0),
}


def canonical_voice_slug(raw: str, *, max_length: int = 64) -> str:
    ascii_name = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    slug = _NON_SLUG.sub("-", ascii_name.strip().lower()).strip("-")
    if not slug:
        raise HTTPException(status_code=422, detail="Voice name must contain at least one letter or number.")
    if len(slug) > max_length:
        raise HTTPException(status_code=422, detail=f"Voice name must be {max_length} characters or fewer after normalization.")
    return slug


def validate_generation_parameters(values: dict[str, float | None]) -> None:
    for field, value in values.items():
        if field not in GENERATION_PARAMETER_BOUNDS or value is None:
            continue
        minimum, maximum = GENERATION_PARAMETER_BOUNDS[field]
        if not minimum <= value <= maximum:
            raise HTTPException(status_code=422, detail=f"{field} must be between {minimum:g} and {maximum:g}.")


def generation_parameter_values(
    *,
    temperature: float | None,
    exaggeration: float | None,
    cfg_weight: float | None,
    repetition_penalty: float | None,
    top_p: float | None,
    min_p: float | None,
) -> dict[str, float | None]:
    values = {
        "temperature": temperature,
        "exaggeration": exaggeration,
        "cfg_weight": cfg_weight,
        "repetition_penalty": repetition_penalty,
        "top_p": top_p,
        "min_p": min_p,
    }
    validate_generation_parameters(values)
    return values


def managed_path(root: Path, relative_name: str) -> Path:
    if not relative_name or Path(relative_name).is_absolute():
        raise HTTPException(status_code=400, detail="Managed file path is invalid.")
    resolved_root = root.resolve()
    candidate = (resolved_root / relative_name).resolve()
    if not candidate.is_relative_to(resolved_root):
        raise HTTPException(status_code=400, detail="Managed file path escapes the Vox data directory.")
    return candidate


def stored_managed_path(root: Path, stored_value: str) -> Path:
    path = Path(stored_value)
    if path.is_absolute():
        candidate = path.resolve()
    elif path.parts and path.parts[0] == root.name:
        candidate = (root.parent / path).resolve()
    else:
        candidate = (root / path).resolve()
    resolved_root = root.resolve()
    if not candidate.is_relative_to(resolved_root):
        raise HTTPException(status_code=400, detail="Stored file path escapes the Vox data directory.")
    return candidate


def decode_voice_icon(value: str, *, max_bytes: int) -> bytes:
    if not value.startswith(_PNG_DATA_URL):
        raise HTTPException(status_code=422, detail="Voice icon must be a PNG data URL.")
    encoded = value[len(_PNG_DATA_URL):]
    if len(encoded) > ((max_bytes + 2) // 3) * 4:
        raise HTTPException(status_code=413, detail=f"Voice icon exceeds the {max_bytes // 1024} KB limit.")
    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Voice icon contains invalid base64 data.") from exc
    if len(payload) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Voice icon exceeds the {max_bytes // 1024} KB limit.")
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != "PNG":
                raise HTTPException(status_code=422, detail="Voice icon content is not a PNG file.")
            width, height = image.size
            if width < 1 or height < 1 or width > 1024 or height > 1024 or width * height > 1_048_576:
                raise HTTPException(status_code=422, detail="Voice icon dimensions must be between 1 and 1,024 pixels.")
            image.verify()
        with Image.open(io.BytesIO(payload)) as image:
            image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Voice icon is not a complete, valid PNG file.") from exc
    return payload


async def stream_upload(upload: UploadFile, destination: Path, *, max_bytes: int) -> int:
    written = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("xb") as output:
            while chunk := await upload.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail=f"Upload exceeds the {max_bytes // (1024 * 1024)} MB limit.")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return written


def validate_backup_members(
    archive: zipfile.ZipFile,
    *,
    max_entries: int = 10_000,
    max_expanded_bytes: int = 4 * 1024 * 1024 * 1024,
    max_compression_ratio: int = 200,
) -> list[zipfile.ZipInfo]:
    members = archive.infolist()
    if len(members) > max_entries:
        raise HTTPException(status_code=413, detail="Backup contains too many entries.")

    names = [member.filename for member in members]
    if len(names) != len(set(names)):
        raise HTTPException(status_code=400, detail="Backup contains duplicate entries.")

    total_size = 0
    for member in members:
        name = member.filename
        path = PurePosixPath(name)
        mode = member.external_attr >> 16
        if (
            not name
            or "\\" in name
            or path.is_absolute()
            or ".." in path.parts
            or stat.S_ISLNK(mode)
            or member.flag_bits & 0x1
        ):
            raise HTTPException(status_code=400, detail="Backup contains an unsafe entry.")
        if name not in {"manifest.json", "data/vox.db"} and not name.startswith("voices/"):
            raise HTTPException(status_code=400, detail="Backup contains an unexpected entry.")
        total_size += member.file_size
        if total_size > max_expanded_bytes:
            raise HTTPException(status_code=413, detail="Expanded backup exceeds the size limit.")
        if member.file_size > 1024 * 1024:
            ratio = member.file_size / max(member.compress_size, 1)
            if ratio > max_compression_ratio:
                raise HTTPException(status_code=413, detail="Backup entry has an unsafe compression ratio.")

    if "manifest.json" not in names or "data/vox.db" not in names:
        raise HTTPException(status_code=400, detail="Backup is missing required Vox files.")
    return members
