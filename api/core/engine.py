"""Lightweight model status facade for the API process."""

from api.core.config import settings


def get_model_status() -> dict[str, str | bool | None]:
    from api.core.generation import get_generation_coordinator

    try:
        return get_generation_coordinator().status()
    except RuntimeError:
        return {
            "state": "not_loaded",
            "ready": False,
            "detail": "Model worker has not started.",
            "device": settings.device,
            "started_at": None,
            "ready_at": None,
        }


def is_model_ready() -> bool:
    return bool(get_model_status()["ready"])


def get_device() -> str:
    return str(get_model_status()["device"] or settings.device)
