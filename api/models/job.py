from pydantic import BaseModel


class JobOut(BaseModel):
    request_id: str
    status: str
    text: str
    preset: str
    output_format: str
    output_path: str | None
    chunks: int | None
    audio_duration_s: float | None
    generation_s: float | None
    encode_s: float | None
    total_s: float | None
    rtf: float | None
    error: str | None
    created_at: str
    completed_at: str | None
