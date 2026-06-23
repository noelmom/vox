import subprocess
from pathlib import Path

from fastapi import HTTPException

from api.core.config import settings

# Formats we accept for voice upload / input folder
INGESTABLE_EXTENSIONS = {".wav", ".m4a", ".mp3", ".aiff", ".aif", ".flac", ".ogg", ".webm"}


def _run_ffmpeg(*args: str):
    try:
        subprocess.run(
            [settings.ffmpeg_path, "-y", *args],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg not found at {settings.ffmpeg_path}. Run: brew install ffmpeg",
        )
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"ffmpeg conversion failed: {exc}")


def convert_to_wav(src: Path, dest: Path):
    """Convert any audio format to a normalized 16-bit 24 kHz mono WAV."""
    _run_ffmpeg(
        "-i", str(src),
        "-ac", "1",
        "-ar", "24000",
        "-c:a", "pcm_s16le",
        str(dest),
    )


VALID_MP3_BITRATES = {96, 128, 192, 256, 320}
VALID_WAV_DEPTHS = {"16", "24", "32f"}

# soundfile subtype for each WAV depth
WAV_SUBTYPES: dict[str, str] = {
    "16": "PCM_16",
    "24": "PCM_24",
    "32f": "FLOAT",
}


def export_mp3(wav_path: Path, mp3_path: Path, bitrate: int | None = None):
    if bitrate and bitrate in VALID_MP3_BITRATES:
        _run_ffmpeg("-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", f"{bitrate}k", str(mp3_path))
    else:
        _run_ffmpeg("-i", str(wav_path), "-codec:a", "libmp3lame", "-qscale:a", "2", str(mp3_path))
