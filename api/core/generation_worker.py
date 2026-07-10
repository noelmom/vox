"""Spawned Chatterbox model owner.

This is the only API module that imports torch or Chatterbox. Keeping those
imports inside ``worker_main`` prevents the web process from acquiring MPS.
"""

import os
import time
from pathlib import Path
from queue import Queue
from typing import Any

from api.core.generation_protocol import PROTOCOL_VERSION, WorkerEvent, safe_partial_path


def _trim_edge_silence(audio, sample_rate: int):
    if audio.size == 0:
        return audio
    peak = float(abs(audio).max())
    if peak <= 0:
        return audio[:0]
    silent = abs(audio) <= max(3e-4, peak * 0.02)
    non_silent = (~silent).nonzero()[0]
    if not non_silent.size:
        return audio[:0]
    pad = int(sample_rate * 0.005)
    return audio[max(0, int(non_silent[0]) - pad):min(audio.size, int(non_silent[-1]) + pad + 1)]


def _minimum_duration(text: str) -> float:
    return 0 if len(text.strip()) < 80 else min(10.0, max(3.0, len(text.strip()) / 28))


def worker_main(command_queue: Queue, event_queue: Queue, device_setting: str, hf_token: str | None) -> None:
    try:
        import numpy as np
        import torch
        from chatterbox.tts import ChatterboxTTS

        if hf_token and not os.environ.get("HF_TOKEN"):
            os.environ["HF_TOKEN"] = hf_token
            os.environ["HUGGING_FACE_HUB_TOKEN"] = hf_token
        device = device_setting if device_setting != "auto" else ("mps" if torch.backends.mps.is_available() else "cpu")

        original_load = torch.load

        def mapped_load(*args, **kwargs):
            kwargs.setdefault("map_location", torch.device(device))
            return original_load(*args, **kwargs)

        try:
            torch.load = mapped_load
            model = ChatterboxTTS.from_pretrained(device=device)
        finally:
            torch.load = original_load

        event_queue.put(WorkerEvent(kind="ready", device=device).to_message())
    except BaseException as exc:
        event_queue.put(WorkerEvent(kind="load_failed", error_code="model_load_failed", detail=str(exc)).to_message())
        return

    while True:
        message: dict[str, Any] = command_queue.get()
        if message.get("version") != PROTOCOL_VERSION:
            continue
        if message.get("kind") == "shutdown":
            return
        if message.get("kind") != "generate":
            continue

        request_id = str(message["request_id"])
        started = time.monotonic()
        try:
            partial_dir = Path(message["partial_dir"])
            partial_dir.mkdir(parents=True, exist_ok=True)
            paths: list[str] = []
            for index, chunk in enumerate(message["chunks"]):
                minimum = _minimum_duration(chunk["text"])
                for attempt in range(3):
                    wav = model.generate(
                        text=chunk["text"],
                        audio_prompt_path=message.get("audio_prompt_path"),
                        **message["params"],
                    )
                    audio = wav.squeeze().cpu().numpy().astype(np.float32, copy=False)
                    audio = _trim_edge_silence(audio, int(model.sr))
                    if minimum == 0 or len(audio) / model.sr >= minimum:
                        break
                else:
                    raise RuntimeError(
                        f"Generation stopped early on chunk {index + 1} after 3 attempts."
                    )
                path = safe_partial_path(str(partial_dir), f"segment-{index:04d}.npy")
                np.save(path, audio, allow_pickle=False)
                paths.append(str(path))
            event_queue.put(
                WorkerEvent(
                    kind="finished",
                    request_id=request_id,
                    sample_rate=int(model.sr),
                    segment_paths=tuple(paths),
                    generation_s=time.monotonic() - started,
                    device=device,
                ).to_message()
            )
        except BaseException as exc:
            event_queue.put(
                WorkerEvent(
                    kind="failed",
                    request_id=request_id,
                    error_code="generation_failed",
                    detail=str(exc),
                    device=device,
                ).to_message()
            )
