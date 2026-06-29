import base64
import re
from uuid import UUID

from fastapi import HTTPException

VOICE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
PRESET_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MAX_SCRIPT_CHARS = 20_000
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
MAX_DESCRIPTION_CHARS = 500
MAX_TAGS = 12
MAX_TAG_CHARS = 32
MAX_DISPLAY_NAME_CHARS = 80
MAX_ICON_DATA_BYTES = 128 * 1024

PARAM_RANGES = {
    "exaggeration": (0.0, 1.0),
    "cfg_weight": (0.0, 1.0),
    "temperature": (0.0, 1.5),
    "repetition_penalty": (1.0, 2.0),
    "top_p": (0.0, 1.0),
    "min_p": (0.0, 1.0),
}


def validate_uuid(value: str, label: str = "request_id") -> str:
    try:
        UUID(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{label} must be a valid UUID.") from exc
    return value


def normalize_voice_name(raw: str) -> str:
    safe = raw.strip().lower().replace(" ", "-")
    safe = re.sub(r"-+", "-", safe)
    if not VOICE_NAME_RE.fullmatch(safe):
        raise HTTPException(
            status_code=422,
            detail="Voice name must be 1-64 characters and contain only letters, numbers, and hyphens.",
        )
    return safe


def normalize_preset_name(raw: str) -> str:
    safe = raw.strip().lower().replace(" ", "-")
    safe = re.sub(r"-+", "-", safe)
    if not PRESET_NAME_RE.fullmatch(safe):
        raise HTTPException(
            status_code=422,
            detail="Preset name must be 1-64 characters and contain only letters, numbers, and hyphens.",
        )
    return safe


def validate_text(text: str) -> str:
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=422, detail="Text cannot be empty.")
    if len(clean) > MAX_SCRIPT_CHARS:
        raise HTTPException(status_code=422, detail=f"Text must be {MAX_SCRIPT_CHARS:,} characters or less.")
    return clean


def validate_optional_text(value: str | None, label: str, max_chars: int) -> str | None:
    if value is None:
        return None
    clean = value.strip()
    if len(clean) > max_chars:
        raise HTTPException(status_code=422, detail=f"{label} must be {max_chars} characters or less.")
    return clean


def validate_tags(tags: list[str]) -> list[str]:
    if len(tags) > MAX_TAGS:
        raise HTTPException(status_code=422, detail=f"Use {MAX_TAGS} tags or fewer.")
    for tag in tags:
        if len(tag) > MAX_TAG_CHARS:
            raise HTTPException(status_code=422, detail=f"Tags must be {MAX_TAG_CHARS} characters or less.")
    return tags


def validate_generation_params(params: dict[str, float | None]) -> dict[str, float | None]:
    for key, value in params.items():
        if value is None:
            continue
        min_value, max_value = PARAM_RANGES[key]
        if value < min_value or value > max_value:
            raise HTTPException(status_code=422, detail=f"{key} must be between {min_value:g} and {max_value:g}.")
    return params


def validate_upload_size(payload: bytes, label: str = "Upload") -> bytes:
    if not payload:
        raise HTTPException(status_code=422, detail=f"{label} file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"{label} file must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller.")
    return payload


def validate_icon_data(value: str | None) -> str | None:
    if value in (None, ""):
        return value
    if not value.startswith("data:image/png;base64,"):
        raise HTTPException(status_code=422, detail="icon_data must be a base64 PNG data URL.")
    raw = value.split(",", 1)[1]
    try:
        decoded = base64.b64decode(raw, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="icon_data is not valid base64.") from exc
    if len(decoded) > MAX_ICON_DATA_BYTES:
        raise HTTPException(status_code=422, detail="icon_data is too large.")
    return value
