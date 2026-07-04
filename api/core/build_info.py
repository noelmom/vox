from __future__ import annotations

import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_VERSION = "0.5.3-beta"


def _read_version() -> str:
    version_file = _ROOT / "VERSION"
    try:
        return version_file.read_text(encoding="utf-8").strip() or _DEFAULT_VERSION
    except OSError:
        return _DEFAULT_VERSION


def get_build_info() -> dict[str, str]:
    defaults = {
        "version": _read_version(),
        "commit": "unknown",
        "built_at": "unknown",
    }
    path = _ROOT / "build_info.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defaults

    return {
        "version": str(raw.get("version") or defaults["version"]),
        "commit": str(raw.get("commit") or defaults["commit"]),
        "built_at": str(raw.get("built_at") or defaults["built_at"]),
    }
