import asyncio
import re
import subprocess
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

app = FastAPI(title="Mac Mini Voice Generator")

OUTPUT_DIR = Path("outputs")
VOICE_DIR = Path("voices")

OUTPUT_DIR.mkdir(exist_ok=True)
VOICE_DIR.mkdir(exist_ok=True)

ALLOWED_VOICE_EXTENSIONS = {".wav"}
FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

DEFAULT_MAX_CHARS = 450
MIN_MAX_CHARS = 100
MAX_MAX_CHARS = 3000

generation_lock = asyncio.Lock()

PRESETS = {
    "default": {
        "temperature": 0.8,
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "repetition_penalty": 1.2,
        "top_p": 1.0,
        "min_p": 0.05,
    },
    "youtube": {
        "temperature": 0.75,
        "exaggeration": 0.55,
        "cfg_weight": 0.6,
        "repetition_penalty": 1.2,
        "top_p": 0.9,
        "min_p": 0.05,
    },
    "hype": {
        "temperature": 0.9,
        "exaggeration": 0.9,
        "cfg_weight": 0.6,
        "repetition_penalty": 1.3,
        "top_p": 0.95,
        "min_p": 0.05,
    },
    "news": {
        "temperature": 0.4,
        "exaggeration": 0.2,
        "cfg_weight": 0.7,
        "repetition_penalty": 1.1,
        "top_p": 0.8,
        "min_p": 0.05,
    },
}

device = "mps" if torch.backends.mps.is_available() else "cpu"
map_location = torch.device(device)

torch_load_original = torch.load


def patched_torch_load(*args, **kwargs):
    if "map_location" not in kwargs:
        kwargs["map_location"] = map_location
    return torch_load_original(*args, **kwargs)


torch.load = patched_torch_load

model = ChatterboxTTS.from_pretrained(device=device)


def clamp_max_chars(value: int | None):
    if value is None:
        return DEFAULT_MAX_CHARS

    return max(MIN_MAX_CHARS, min(value, MAX_MAX_CHARS))


def split_text(text: str, max_chars: int):
    text = re.sub(r"\s+", " ", text.strip())

    if not text:
        return []

    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)

    chunks = []
    current = ""

    for sentence in sentences:
        if len(sentence) > max_chars:
            if current:
                chunks.append(current)
                current = ""

            for i in range(0, len(sentence), max_chars):
                chunks.append(sentence[i:i + max_chars].strip())

            continue

        if len(current) + len(sentence) + 1 <= max_chars:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(current)
            current = sentence

    if current:
        chunks.append(current)

    return chunks


def trim_edge_silence(audio: np.ndarray, sample_rate: int):
    if audio.size == 0:
        return audio

    peak = float(np.max(np.abs(audio)))
    if peak <= 0.0:
        return audio[:0]

    threshold = max(3e-4, peak * 0.02)
    silent = np.abs(audio) <= threshold
    if not silent.any():
        return audio

    start = 0
    end = audio.size

    while start < end and silent[start]:
        start += 1
    while end > start and silent[end - 1]:
        end -= 1

    if start >= end:
        return audio[:0]

    pad = int(sample_rate * 0.005)
    return audio[max(0, start - pad): min(audio.size, end + pad)]


def stitch_chunks(chunks: list[np.ndarray], sample_rate: int):
    if not chunks:
        return np.array([], dtype=np.float32)

    output = chunks[0]
    crossfade = int(sample_rate * 0.08)

    for chunk in chunks[1:]:
        if output.size == 0:
            output = chunk
            continue
        if chunk.size == 0:
            continue

        overlap = min(crossfade, output.size, chunk.size)
        if overlap <= 0:
            output = np.concatenate([output, chunk])
            continue

        fade_out = np.linspace(1.0, 0.0, overlap, endpoint=False, dtype=output.dtype)
        fade_in = 1.0 - fade_out
        blended = output[-overlap:] * fade_out + chunk[:overlap] * fade_in
        output = np.concatenate([output[:-overlap], blended, chunk[overlap:]])

    return output


def list_voices():
    return sorted(
        [
            p.name
            for p in VOICE_DIR.iterdir()
            if (
                p.is_file()
                and not p.name.startswith(".")
                and p.suffix.lower() in ALLOWED_VOICE_EXTENSIONS
            )
        ]
    )


def get_named_voice_path(voice_name: str | None):
    if not voice_name:
        return None

    safe_name = Path(voice_name).stem

    possible_files = [
        VOICE_DIR / f"{safe_name}.wav",
        VOICE_DIR / voice_name,
    ]

    for file_path in possible_files:
        if (
            file_path.exists()
            and file_path.is_file()
            and not file_path.name.startswith(".")
            and file_path.suffix.lower() in ALLOWED_VOICE_EXTENSIONS
        ):
            return file_path

    raise HTTPException(
        status_code=404,
        detail=f"Voice '{voice_name}' not found",
    )


def export_mp3(wav_path: Path, mp3_path: Path):
    try:
        subprocess.run(
            [
                FFMPEG_PATH,
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-qscale:a",
                "2",
                str(mp3_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg not found at {FFMPEG_PATH}. Run: brew install ffmpeg",
        )
    except subprocess.CalledProcessError:
        raise HTTPException(
            status_code=500,
            detail="MP3 conversion failed.",
        )


@app.get("/")
def health():
    return {
        "status": "ok",
        "device": device,
        "default_max_chars": DEFAULT_MAX_CHARS,
        "min_max_chars": MIN_MAX_CHARS,
        "max_max_chars": MAX_MAX_CHARS,
        "ffmpeg_path": FFMPEG_PATH,
        "presets": list(PRESETS.keys()),
        "voices": list_voices(),
    }


@app.get("/presets")
def presets():
    return PRESETS


@app.get("/voices")
def voices():
    return {
        "voices": list_voices()
    }


@app.post("/tts")
async def generate_tts(
    text: str = Form(...),
    preset: str = Form("default"),
    output_format: str = Form("wav"),
    voice_name: str | None = Form(None),
    voice: UploadFile | None = File(None),

    max_chars: int | None = Form(None),

    temperature: float | None = Form(None),
    exaggeration: float | None = Form(None),
    cfg_weight: float | None = Form(None),
    repetition_penalty: float | None = Form(None),
    top_p: float | None = Form(None),
    min_p: float | None = Form(None),
):
    async with generation_lock:
        request_start = time.time()

        preset_name = preset.lower()
        output_format_name = output_format.lower()
        chunk_max_chars = clamp_max_chars(max_chars)

        selected = PRESETS.get(
            preset_name,
            PRESETS["default"],
        ).copy()

        if temperature is not None:
            selected["temperature"] = temperature

        if exaggeration is not None:
            selected["exaggeration"] = exaggeration

        if cfg_weight is not None:
            selected["cfg_weight"] = cfg_weight

        if repetition_penalty is not None:
            selected["repetition_penalty"] = repetition_penalty

        if top_p is not None:
            selected["top_p"] = top_p

        if min_p is not None:
            selected["min_p"] = min_p

        audio_prompt_path = get_named_voice_path(voice_name)

        if voice:
            uploaded_voice = OUTPUT_DIR / f"uploaded_voice_{uuid.uuid4()}.wav"
            uploaded_voice.write_bytes(await voice.read())
            audio_prompt_path = uploaded_voice

        chunks = split_text(text, chunk_max_chars)

        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Text cannot be empty.",
            )

        audio_segments = []
        generation_start = time.time()

        for chunk in chunks:
            wav = model.generate(
                text=chunk,
                audio_prompt_path=(
                    str(audio_prompt_path)
                    if audio_prompt_path
                    else None
                ),
                **selected,
            )

            audio = wav.squeeze().cpu().numpy()
            audio = trim_edge_silence(audio, model.sr)
            audio_segments.append(audio)

        generation_seconds = time.time() - generation_start

        final_audio = stitch_chunks(audio_segments, model.sr)

        output_id = uuid.uuid4()
        wav_path = OUTPUT_DIR / f"{output_id}.wav"

        sf.write(
            str(wav_path),
            final_audio,
            model.sr,
        )

        audio_duration_seconds = len(final_audio) / model.sr

        common_headers = {
            "X-Preset": preset_name,
            "X-Device": device,
            "X-Chunks": str(len(chunks)),
            "X-Max-Chars": str(chunk_max_chars),
            "X-Audio-Duration-Seconds": f"{audio_duration_seconds:.2f}",
            "X-Generation-Seconds": f"{generation_seconds:.2f}",
            "X-Total-Seconds": f"{time.time() - request_start:.2f}",
            "X-RTF": f"{generation_seconds / audio_duration_seconds:.2f}"
            if audio_duration_seconds > 0
            else "0",
        }

        if output_format_name == "mp3":
            mp3_path = OUTPUT_DIR / f"{output_id}.mp3"

            mp3_start = time.time()
            export_mp3(wav_path, mp3_path)
            mp3_seconds = time.time() - mp3_start

            common_headers["X-MP3-Encode-Seconds"] = f"{mp3_seconds:.2f}"
            common_headers["X-Total-Seconds"] = f"{time.time() - request_start:.2f}"

            return FileResponse(
                mp3_path,
                media_type="audio/mpeg",
                filename=f"{preset_name}.mp3",
                headers=common_headers,
            )

        return FileResponse(
            wav_path,
            media_type="audio/wav",
            filename=f"{preset_name}.wav",
            headers=common_headers,
        )
