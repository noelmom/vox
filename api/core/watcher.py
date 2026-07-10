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

async def _ingest_file(path: Path):
    from api.routers.voices import _register_voice  # local import to avoid circulars

    if path.is_symlink():
        raise ValueError("symbolic links are not accepted in the input folder")
    source = managed_path(settings.input_dir, path.name)
    if source != path.resolve():
        raise ValueError("input file is outside the managed input folder")

    name = canonical_voice_slug(source.stem)
    wav_dest = managed_path(settings.voice_dir, f"{name}.wav")
    staged_wav = managed_path(settings.voice_dir, f"tmp_watcher_{uuid.uuid4()}.wav")
    prior_wav = managed_path(settings.voice_dir, f".prior-watcher-{uuid.uuid4()}.wav")
    processed_dir = managed_path(settings.input_dir, "processed")
    processed_dir.mkdir(exist_ok=True)
    processed_dest = managed_path(processed_dir, source.name)
    if processed_dest.exists():
        processed_dest = managed_path(processed_dir, f"{source.stem}-{uuid.uuid4().hex[:8]}{source.suffix}")
    source_moved = False
    live_voice_replaced = False

    try:
        if source.stat().st_size > settings.max_voice_upload_mb * 1024 * 1024:
            raise ValueError(f"file exceeds {settings.max_voice_upload_mb} MB limit")
        if source.suffix.lower() == ".wav":
            import shutil
            shutil.copy2(source, staged_wav)
        else:
            convert_to_wav(source, staged_wav)
        trim_wav_edges(staged_wav)
        duration = audio_duration_seconds(staged_wav)
        if duration > settings.max_voice_clip_duration_s:
            raise ValueError(f"audio exceeds {settings.max_voice_clip_duration_s}s limit")

        source.replace(processed_dest)
        source_moved = True
        if wav_dest.exists():
            wav_dest.replace(prior_wav)
        staged_wav.replace(wav_dest)
        live_voice_replaced = True

        db = await get_db()
        await _register_voice(
            db=db,
            name=name,
            wav_path=wav_dest,
            original_filename=source.name[:255],
            description="Auto-imported from input folder",
            params=VoiceParams(),
            tags=["auto-import"],
        )
        try:
            prior_wav.unlink(missing_ok=True)
        except OSError as cleanup_error:
            log.warning("Could not remove prior watcher staging file %s: %s", prior_wav.name, cleanup_error)
        log.info("Ingested voice from input folder: %s -> %s", source.name, wav_dest.name)

    except Exception as exc:
        if live_voice_replaced:
            wav_dest.unlink(missing_ok=True)
            if prior_wav.exists():
                prior_wav.replace(wav_dest)
        if source_moved and processed_dest.exists() and not source.exists():
            processed_dest.replace(source)
        log.error("Failed to ingest %s: %s", source.name, exc)
    finally:
        for staging_path in (staged_wav, prior_wav):
            try:
                staging_path.unlink(missing_ok=True)
            except OSError as cleanup_error:
                log.warning("Could not remove watcher staging file %s: %s", staging_path.name, cleanup_error)


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
                if path.is_symlink():
                    log.warning("Ignoring symbolic link in input folder: %s", path.name)
                    continue
                if path.is_file() and path.suffix.lower() in INGESTABLE_EXTENSIONS:
                    log.info("Watcher detected new file: %s", path.name)
                    await _ingest_file(path)
        except Exception as exc:
            log.error("Watcher error: %s", exc)
