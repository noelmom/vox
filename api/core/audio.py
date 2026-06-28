import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
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
        raise HTTPException(
            status_code=400,
            detail="Could not read or convert that audio file. Please try re-exporting it as a standard M4A or WAV file.",
        ) from exc


def convert_to_wav(src: Path, dest: Path):
    """Convert any audio format to a normalized 16-bit 24 kHz mono WAV."""
    _run_ffmpeg(
        "-i", str(src),
        "-ac", "1",
        "-ar", "24000",
        "-c:a", "pcm_s16le",
        str(dest),
    )


def audio_duration_seconds(path: Path) -> float:
    """Return the duration of an audio file in seconds."""
    return float(sf.info(str(path)).duration)


def trim_wav_edges(path: Path, threshold_ratio: float = 0.02, pad_ms: float = 5.0):
    """Trim near-silent samples from the start/end of a WAV file in place."""
    audio, sample_rate = sf.read(str(path), always_2d=False)
    if audio.size == 0:
        return

    if audio.ndim > 1:
        mono = np.max(np.abs(audio), axis=1)
    else:
        mono = np.abs(audio)

    peak = float(np.max(mono))
    if peak <= 0.0:
        return

    threshold = max(3e-4, peak * threshold_ratio)
    silent = mono <= threshold
    if not silent.any():
        return

    start = 0
    end = mono.shape[0]

    while start < end and silent[start]:
        start += 1
    while end > start and silent[end - 1]:
        end -= 1

    if start >= end:
        return

    pad = int(sample_rate * (pad_ms / 1000.0))
    trimmed = audio[max(0, start - pad) : min(mono.shape[0], end + pad)]
    sf.write(str(path), trimmed, sample_rate, subtype="PCM_16")


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
