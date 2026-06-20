import asyncio
import os

import torch
from chatterbox.tts import ChatterboxTTS

from api.core.config import settings
from api.core.logger import get_logger

log = get_logger(__name__)

_model: ChatterboxTTS | None = None
_lock = asyncio.Lock()


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


def load_model():
    global _model
    device = _resolve_device()

    _configure_hf_token()

    log.info("Loading Chatterbox model on device: %s", device)

    # Ensure weights load onto the right device regardless of how they were saved
    torch_load_original = torch.load

    def _patched_load(*args, **kwargs):
        kwargs.setdefault("map_location", torch.device(device))
        return torch_load_original(*args, **kwargs)

    torch.load = _patched_load
    _model = ChatterboxTTS.from_pretrained(device=device)
    torch.load = torch_load_original

    log.info("Chatterbox model loaded successfully")


def get_model() -> ChatterboxTTS:
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() at startup.")
    return _model


def get_device() -> str:
    return _resolve_device()


def get_lock() -> asyncio.Lock:
    return _lock
