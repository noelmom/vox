"""
Watches the input/ folder for audio files.
On discovery: converts to WAV → registers as a voice profile → moves original to input/processed/.
Voice name is derived from the filename stem.
"""
import asyncio
from pathlib import Path

from api.core.audio import INGESTABLE_EXTENSIONS, convert_to_wav
from api.core.config import settings
from api.core.db import get_db
from api.core.logger import get_logger
from api.models.voice import VoiceParams

log = get_logger(__name__)

_PROCESSED_DIR = settings.input_dir / "processed"


async def _ingest_file(path: Path):
    from api.routers.voices import _register_voice  # local import to avoid circulars

    name = path.stem.lower().replace(" ", "-")
    wav_dest = settings.voice_dir / f"{name}.wav"

    try:
        if path.suffix.lower() == ".wav":
            import shutil
            shutil.copy2(path, wav_dest)
        else:
            convert_to_wav(path, wav_dest)

        db = await get_db()
        await _register_voice(
            db=db,
            name=name,
            wav_path=wav_dest,
            original_filename=path.name,
            description="Auto-imported from input folder",
            params=VoiceParams(),
            tags=["auto-import"],
        )

        dest = _PROCESSED_DIR / path.name
        path.rename(dest)
        log.info("Ingested voice from input folder: %s -> %s", path.name, wav_dest.name)

    except Exception as exc:
        log.error("Failed to ingest %s: %s", path.name, exc)


async def watch_input_folder():
    log.info(
        "Input folder watcher started: %s (polling every %ds)",
        settings.input_dir,
        settings.watcher_interval_s,
    )
    while True:
        await asyncio.sleep(settings.watcher_interval_s)
        try:
            for path in settings.input_dir.iterdir():
                if path.is_file() and path.suffix.lower() in INGESTABLE_EXTENSIONS:
                    log.info("Watcher detected new file: %s", path.name)
                    await _ingest_file(path)
        except Exception as exc:
            log.error("Watcher error: %s", exc)
