from pydantic import BaseModel


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
    exaggeration: float | None
    cfg_weight: float | None
    temperature: float | None
    repetition_penalty: float | None
    top_p: float | None
    min_p: float | None
    created_at: str


class VoiceCreate(BaseModel):
    name: str
    description: str | None = None
    params: VoiceParams = VoiceParams()
