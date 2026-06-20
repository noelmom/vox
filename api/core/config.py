from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Vox"
    # TODO: default to "127.0.0.1" (localhost) once local macOS app packaging is in place.
    # Currently 0.0.0.0 so the API is reachable from any device on the network during development.
    host: str = "0.0.0.0"
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

    # Hugging Face token — optional, enables authenticated downloads (faster + gated models).
    # Set via HF_TOKEN env var or .env file. Never commit the value to git.
    hf_token: str | None = None

    # Cleanup: how long to keep generated output files (hours). 0 = never.
    output_ttl_hours: int = 24
    # How often the watcher and cleanup tasks poll (seconds).
    watcher_interval_s: int = 10
    cleanup_interval_s: int = 3600

    class Config:
        env_prefix = "VOX_"
        env_file = ".env"
        # HF_TOKEN is also read without the prefix in engine.py since it's
        # a standard HuggingFace convention used by the huggingface_hub library.


settings = Settings()

settings.output_dir.mkdir(exist_ok=True)
settings.voice_dir.mkdir(exist_ok=True)
settings.input_dir.mkdir(exist_ok=True)
(settings.input_dir / "processed").mkdir(exist_ok=True)
settings.db_path.parent.mkdir(exist_ok=True)
