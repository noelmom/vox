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
    error_code: str | None = None
    state_detail: str | None = None
    progress_current: int | None = None
    progress_total: int | None = None
    voice_name: str | None = None
    device: str | None = None
    user_agent: str | None = None
    created_at: str
    completed_at: str | None
    file_available: bool = False
    private_fields_redacted: bool = False
