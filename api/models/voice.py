from pydantic import BaseModel, field_validator


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def _serialize_tags(tags: list[str]) -> str:
    return ",".join(tags)


class VoiceParams(BaseModel):
    exaggeration: float | None = None
    cfg_weight: float | None = None
    temperature: float | None = None
    repetition_penalty: float | None = None
    top_p: float | None = None
    min_p: float | None = None


class VoiceOut(BaseModel):
    id: str
    name: str
    filename: str
    original_filename: str | None
    description: str | None
    tags: list[str] = []
    exaggeration: float | None
    cfg_weight: float | None
    temperature: float | None
    repetition_penalty: float | None
    top_p: float | None
    min_p: float | None
    created_at: str
    is_favorite: bool = False
    display_name: str | None = None
    icon_data: str | None = None

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v):
        if isinstance(v, str):
            return _parse_tags(v)
        return v or []

    @field_validator("is_favorite", mode="before")
    @classmethod
    def coerce_bool(cls, v):
        return bool(v)


class VoiceCreate(BaseModel):
    name: str
    description: str | None = None
    params: VoiceParams = VoiceParams()
