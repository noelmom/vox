import time
import uuid
from pathlib import Path
from queue import Queue

import numpy as np
import soundfile as sf

from api.core.audio import WAV_SUBTYPES, export_mp3
from api.core.data_safety import managed_path
from api.core.generation_protocol import GenerationRequest, WorkerEvent


def encoder_main(request: GenerationRequest, event: WorkerEvent, output_dir_value: str, result_queue: Queue) -> None:
    try:
        os.setsid()
        output_dir = Path(output_dir_value).resolve()
        partial_dir = managed_path(managed_path(output_dir, ".partial"), request.request_id)
        if partial_dir != Path(request.partial_dir).resolve():
            raise RuntimeError("Generation request has an invalid partial directory.")
        arrays = []
        for value in event.segment_paths:
            path = managed_path(partial_dir, Path(value).name)
            if path != Path(value).resolve() or not path.name.startswith("segment-"):
                raise RuntimeError("Model worker returned an invalid segment path.")
            arrays.append(np.load(path, allow_pickle=False))
        pieces: list[np.ndarray] = []
        dtype = next((audio.dtype for audio in arrays if audio.size), np.float32)
        for index, audio in enumerate(arrays):
            if audio.size:
                pieces.append(audio)
                pause = request.chunks[index].pause_after_s
                if pause > 0 and index < len(arrays) - 1:
                    pieces.append(np.zeros(int((event.sample_rate or 1) * pause), dtype=dtype))
        if not pieces:
            raise RuntimeError("Model worker returned no audio.")
        final_audio = np.concatenate(pieces)
        output_id = str(uuid.uuid4())
        started = time.monotonic()
        if request.output_format == "mp3":
            wav = managed_path(partial_dir, "encoded.wav")
            staging = managed_path(partial_dir, f"{output_id}.mp3")
            sf.write(wav, final_audio, event.sample_rate, subtype="PCM_16")
            export_mp3(wav, staging, bitrate=request.mp3_bitrate)
        else:
            staging = managed_path(partial_dir, f"{output_id}.wav")
            sf.write(staging, final_audio, event.sample_rate, subtype=WAV_SUBTYPES.get(request.wav_bit_depth or "16", "PCM_16"))
        final_path = managed_path(output_dir, staging.name)
        marker_path = managed_path(output_dir, f".publishing-{request.request_id}--{staging.name}")
        staging.replace(marker_path)
        encode_s = time.monotonic() - started
        total_s = time.time() - request.submitted_at if request.submitted_at else (event.generation_s or 0) + encode_s
        result_queue.put({"ok": True, "marker": str(marker_path), "final": str(final_path), "samples": len(final_audio), "encode_s": encode_s, "total_s": total_s})
    except BaseException as exc:
        result_queue.put({"ok": False, "error": str(exc)})
import os
