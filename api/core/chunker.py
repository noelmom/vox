import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    text: str
    pause_after_s: float = 0.0


def _pause_for_text(text: str, forced: bool = False) -> float:
    text = text.rstrip()
    if forced:
        return 0.02
    if not text:
        return 0.0
    if text.endswith((".", "!", "?")):
        return 0.18
    if text.endswith((",", ";", ":")):
        return 0.08
    return 0.0


def _best_split_point(text: str, max_chars: int) -> int | None:
    window = text[: max_chars + 1]
    candidates: list[int] = []
    for pattern in (r"(?<=[.!?])\s+", r"(?<=[,;:])\s+", r"\s+"):
        matches = list(re.finditer(pattern, window))
        if matches:
            candidates.append(matches[-1].start())
    if not candidates:
        return None
    return max(candidates)


def _split_long_sentence(sentence: str, max_chars: int) -> list[TextChunk]:
    sentence = sentence.strip()
    if not sentence:
        return []

    pieces: list[TextChunk] = []
    remaining = sentence

    while len(remaining) > max_chars:
        split_at = _best_split_point(remaining, max_chars)
        if split_at is None or split_at < max(1, max_chars // 3):
            split_at = max_chars

        piece = remaining[:split_at].strip()
        if piece:
            pieces.append(TextChunk(piece, _pause_for_text(piece, forced=True)))
        remaining = remaining[split_at:].strip()

    if remaining:
        pieces.append(TextChunk(remaining, _pause_for_text(remaining)))

    return pieces


def split_text(text: str, max_chars: int, headroom_chars: int = 0) -> list[TextChunk]:
    text = re.sub(r"\s+", " ", text.strip())

    if not text:
        return []

    soft_max = max(1, max_chars - max(0, headroom_chars))

    if len(text) <= soft_max:
        return [TextChunk(text, 0.0)]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[TextChunk] = []
    current = ""

    for sentence in sentences:
        if len(sentence) > soft_max:
            if current:
                chunks.append(TextChunk(current, _pause_for_text(current)))
                current = ""
            chunks.extend(_split_long_sentence(sentence, soft_max))
            continue

        if len(current) + len(sentence) + 1 <= soft_max:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(TextChunk(current, _pause_for_text(current)))
            current = sentence

    if current:
        chunks.append(TextChunk(current, 0.0))

    return chunks


def clamp_max_chars(value: int | None, default: int, minimum: int, maximum: int) -> int:
    if value is None:
        return default
    return max(minimum, min(value, maximum))
