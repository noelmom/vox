import asyncio
import os
from datetime import datetime, timezone

import torch
from chatterbox.tts import ChatterboxTTS

from api.core.config import settings
from api.core.logger import get_logger

log = get_logger(__name__)

_model: ChatterboxTTS | None = None
_lock = asyncio.Lock()
_state = "not_loaded"
_detail = "Model has not started loading."
_started_at: str | None = None
_ready_at: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _resolve_device() -> str:
    if settings.device != "auto":
        return settings.device
    return "mps" if torch.backends.mps.is_available() else "cpu"


def _configure_hf_token():
    """
    Set the HuggingFace token in the environment so huggingface_hub picks it up
    automatically during model download. Supports both HF_TOKEN (standard HF
    convention) and VOX_HF_TOKEN (Vox-prefixed). HF_TOKEN takes priority.
    """
    token = os.environ.get("HF_TOKEN") or settings.hf_token
    if token:
        os.environ["HF_TOKEN"] = token
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token  # legacy compat
        log.info("HuggingFace token configured — authenticated downloads enabled")
    else:
        log.info("No HF_TOKEN set — using anonymous HuggingFace downloads")


def _configure_mps_memory(device: str):
    if device != "mps":
        return
    setter = getattr(torch.mps, "set_per_process_memory_fraction", None)
    if not callable(setter):
        log.warning("PyTorch MPS memory fraction is not supported by this torch build")
        return
    try:
        setter(settings.mps_memory_fraction)
        log.info("Experimental MPS memory fraction set to %.0f%%", settings.mps_memory_fraction * 100)
    except Exception as exc:
        log.warning("Could not set MPS memory fraction to %.2f: %s", settings.mps_memory_fraction, exc)


def load_model():
    global _model, _state, _detail, _started_at, _ready_at
    device = _resolve_device()

    _configure_hf_token()
    _configure_mps_memory(device)

    _state = "loading"
    _detail = f"Loading Chatterbox model on {device}."
    _started_at = _now()
    _ready_at = None
    log.info("Loading Chatterbox model on device: %s", device)

    # Ensure weights load onto the right device regardless of how they were saved
    torch_load_original = torch.load

    def _patched_load(*args, **kwargs):
        kwargs.setdefault("map_location", torch.device(device))
        return torch_load_original(*args, **kwargs)

    try:
        torch.load = _patched_load
        _model = ChatterboxTTS.from_pretrained(device=device)
    except Exception as exc:
        _state = "error"
        _detail = str(exc)
        raise
    finally:
        torch.load = torch_load_original

    _state = "ready"
    _detail = f"Chatterbox model loaded on {device}."
    _ready_at = _now()
    log.info("Chatterbox model loaded successfully")


async def load_model_async():
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, load_model)


def get_model() -> ChatterboxTTS:
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() at startup.")
    return _model


def is_model_ready() -> bool:
    return _model is not None and _state == "ready"


def get_model_status() -> dict[str, str | bool | None]:
    return {
        "state": _state,
        "ready": is_model_ready(),
        "detail": _detail,
        "device": _resolve_device(),
        "started_at": _started_at,
        "ready_at": _ready_at,
    }


def get_device() -> str:
    return _resolve_device()


def get_lock() -> asyncio.Lock:
    return _lock
