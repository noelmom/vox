from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Vox"
    # Local-only by default. Set VOX_HOST=0.0.0.0 to allow LAN access.
    host: str = "127.0.0.1"
    port: int = 8000
    device: str = "auto"  # auto | mps | cpu

    output_dir: Path = Path("outputs")
    voice_dir: Path = Path("voices")
    input_dir: Path = Path("input")
    db_path: Path = Path("data/vox.db")
    ffmpeg_path: str = "/opt/homebrew/bin/ffmpeg"

    default_max_chars: int = 450
    min_max_chars: int = 100
    max_max_chars: int = 3000
    chunk_headroom_chars: int = 40
    max_voice_clip_duration_s: int = 120
    voice_icon_max_kb: int = 100
    deleted_voice_ttl_hours: int = 72

    # Hugging Face token — optional, enables authenticated downloads (faster + gated models).
    # Set via HF_TOKEN env var or .env file. Never commit the value to git.
    hf_token: str | None = None

    # Cleanup: how long to keep generated output files (hours). 0 = never.
    output_ttl_hours: int = 24
    # Cleanup: how long to keep job rows in SQLite (days). 0 = never.
    job_retention_days: int = 30
    # How often the watcher and cleanup tasks poll (seconds).
    watcher_interval_s: int = 10
    cleanup_interval_s: int = 3600

    class Config:
        env_prefix = "VOX_"
        env_file = ".env"
        # HF_TOKEN is also read without the prefix in engine.py since it's
        # a standard HuggingFace convention used by the huggingface_hub library.

    @field_validator("max_voice_clip_duration_s", mode="before")
    @classmethod
    def _parse_max_voice_clip_duration_s(cls, value):
        default = 120
        if value is None:
            return default
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return default
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed > 0 else default

    @field_validator("default_max_chars", mode="before")
    @classmethod
    def _parse_default_max_chars(cls, value):
        default = 450
        if value is None:
            return default
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return default
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if 100 <= parsed <= 3000 else default

    @field_validator("chunk_headroom_chars", mode="before")
    @classmethod
    def _parse_chunk_headroom_chars(cls, value):
        default = 40
        if value is None:
            return default
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return default
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed >= 0 else default


settings = Settings()

settings.output_dir.mkdir(exist_ok=True)
settings.voice_dir.mkdir(exist_ok=True)
(settings.voice_dir / "deleted").mkdir(exist_ok=True)
settings.input_dir.mkdir(exist_ok=True)
(settings.input_dir / "processed").mkdir(exist_ok=True)
settings.db_path.parent.mkdir(exist_ok=True)
