from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


PROTOCOL_VERSION = 1


@dataclass(frozen=True)
class GenerationChunk:
    text: str
    pause_after_s: float = 0.0


@dataclass(frozen=True)
class GenerationRequest:
    request_id: str
    chunks: tuple[GenerationChunk, ...]
    params: dict[str, float]
    audio_prompt_path: str | None
    partial_dir: str
    output_format: str
    mp3_bitrate: int | None = None
    wav_bit_depth: str | None = None
    submitted_at: float = 0.0

    def to_message(self) -> dict[str, Any]:
        return {"version": PROTOCOL_VERSION, "kind": "generate", **asdict(self)}


@dataclass(frozen=True)
class WorkerEvent:
    kind: str
    request_id: str | None = None
    sample_rate: int | None = None
    segment_paths: tuple[str, ...] = field(default_factory=tuple)
    generation_s: float | None = None
    device: str | None = None
    error_code: str | None = None
    detail: str | None = None

    @classmethod
    def from_message(cls, message: dict[str, Any]) -> "WorkerEvent":
        if message.get("version") != PROTOCOL_VERSION:
            raise ValueError("Unsupported generation worker protocol version.")
        fields = {key: message.get(key) for key in cls.__dataclass_fields__}
        fields["segment_paths"] = tuple(fields.get("segment_paths") or ())
        return cls(**fields)

    def to_message(self) -> dict[str, Any]:
        return {"version": PROTOCOL_VERSION, **asdict(self)}


def safe_partial_path(partial_dir: str, filename: str) -> Path:
    root = Path(partial_dir).resolve()
    candidate = (root / filename).resolve()
    if candidate.parent != root:
        raise ValueError("Worker output escaped its partial directory.")
    return candidate
