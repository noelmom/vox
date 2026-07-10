"""
Watches the input/ folder for audio files.
On discovery: converts to WAV → registers as a voice profile → moves original to input/processed/.
Voice name is derived from the filename stem.
"""
import asyncio
import uuid
from pathlib import Path

from api.core.audio import INGESTABLE_EXTENSIONS, audio_duration_seconds, convert_to_wav, trim_wav_edges
from api.core.config import settings
from api.core.data_safety import canonical_voice_slug, managed_path
from api.core.db import get_db
from api.core.logger import get_logger
from api.models.voice import VoiceParams

log = get_logger(__name__)

_PROCESSED_DIR = managed_path(settings.input_dir, "processed")


async def _ingest_file(path: Path):
    from api.routers.voices import _register_voice  # local import to avoid circulars

    name = canonical_voice_slug(path.stem)
    wav_dest = managed_path(settings.voice_dir, f"{name}.wav")
    staged_wav = managed_path(settings.voice_dir, f"tmp_watcher_{uuid.uuid4()}.wav")
    prior_wav = managed_path(settings.voice_dir, f".prior-watcher-{uuid.uuid4()}.wav")

    try:
        if path.stat().st_size > settings.max_voice_upload_mb * 1024 * 1024:
            raise ValueError(f"file exceeds {settings.max_voice_upload_mb} MB limit")
        if path.suffix.lower() == ".wav":
            import shutil
            shutil.copy2(path, staged_wav)
        else:
            convert_to_wav(path, staged_wav)
        trim_wav_edges(staged_wav)
        duration = audio_duration_seconds(staged_wav)
        if duration > settings.max_voice_clip_duration_s:
            raise ValueError(f"audio exceeds {settings.max_voice_clip_duration_s}s limit")

        if wav_dest.exists():
            wav_dest.replace(prior_wav)
        staged_wav.replace(wav_dest)

        db = await get_db()
        try:
            await _register_voice(
                db=db,
                name=name,
                wav_path=wav_dest,
                original_filename=path.name[:255],
                description="Auto-imported from input folder",
                params=VoiceParams(),
                tags=["auto-import"],
            )
        except Exception:
            wav_dest.unlink(missing_ok=True)
            if prior_wav.exists():
                prior_wav.replace(wav_dest)
            raise
        prior_wav.unlink(missing_ok=True)

        dest = managed_path(_PROCESSED_DIR, path.name)
        if dest.exists():
            dest = managed_path(_PROCESSED_DIR, f"{path.stem}-{uuid.uuid4().hex[:8]}{path.suffix}")
        path.rename(dest)
        log.info("Ingested voice from input folder: %s -> %s", path.name, wav_dest.name)

    except Exception as exc:
        log.error("Failed to ingest %s: %s", path.name, exc)
    finally:
        staged_wav.unlink(missing_ok=True)
        prior_wav.unlink(missing_ok=True)


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
