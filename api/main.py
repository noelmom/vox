import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.core.cleanup import run_cleanup_loop
from api.core.config import settings
from api.core.build_info import get_build_info
from api.core.db import connect, disconnect
from api.core.engine import get_device, get_model_status, load_model_async
from api.core.logger import setup_logging
from api.core.presets import PRESETS
from api.core.watcher import watch_input_folder
from api.middleware.request_id import RequestIDMiddleware
from api.routers import alerts, backups, jobs, logs, preferences, presets, tts, voices

_UI_DIST = Path(__file__).parent.parent / "ui-dist"
_ENV_PATH = Path(".env")
_VALID_HOSTS = {"127.0.0.1", "0.0.0.0"}

_background_tasks: list[asyncio.Task] = []
_model_task: asyncio.Task | None = None


class SettingsPatch(BaseModel):
    host: str | None = None
    output_ttl_hours: int | None = Field(None, ge=0, le=8760)
    max_voice_clip_duration_s: int | None = Field(None, ge=5, le=600)
    chunk_headroom_chars: int | None = Field(None, ge=0, le=1000)


def _read_env_value(key: str, default: str | None = None) -> str | None:
    if not _ENV_PATH.exists():
        return default
    prefix = f"{key}="
    for line in _ENV_PATH.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped[len(prefix):].split("#", 1)[0].strip().strip('"').strip("'")
    return default


def _write_env_value(key: str, value: str):
    lines = _ENV_PATH.read_text().splitlines() if _ENV_PATH.exists() else []
    prefix = f"{key}="
    commented_prefix = f"# {key}="
    next_line = f"{key}={value}"
    wrote = False
    updated: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix) or stripped.startswith(commented_prefix):
            if not wrote:
                updated.append(next_line)
                wrote = True
            continue
        updated.append(line)

    if not wrote:
        if updated and updated[-1].strip():
            updated.append("")
        updated.append(next_line)

    _ENV_PATH.write_text("\n".join(updated) + "\n")


def _read_env_int(key: str, default: int) -> int:
    raw = _read_env_value(key, str(default))
    try:
        return int(raw) if raw is not None else default
    except (TypeError, ValueError):
        return default


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model_task
    setup_logging()
    await connect()
    _model_task = asyncio.create_task(load_model_async())

    _background_tasks.append(asyncio.create_task(watch_input_folder()))
    _background_tasks.append(asyncio.create_task(run_cleanup_loop()))

    yield

    if _model_task:
        _model_task.cancel()
    for task in _background_tasks:
        task.cancel()
    await asyncio.gather(*_background_tasks, _model_task, return_exceptions=True)
    await disconnect()


_DESCRIPTION = """
**Vox** is a local text-to-speech API running on your Mac, powered by [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) — a high-quality voice synthesis model optimised for Apple Silicon.

## Base URL

All API routes are versioned under `/api/v1`:

```
http://localhost:8000/api/v1
```

## Quick start

```bash
# 1. Generate speech (returns immediately with a job ID)
curl -X POST http://localhost:8000/api/v1/tts \\
  -F "text=Hello, this is Vox." \\
  -F "voice_name=my-voice" \\
  -F "preset=default" \\
  --output /dev/null -w "%{http_code}"   # → 202

# 2. Poll until completed
curl http://localhost:8000/api/v1/jobs/{request_id}

# 3. Download audio
curl http://localhost:8000/api/v1/jobs/{request_id}/audio --output audio.mp3
```

## Generation parameters

All six Chatterbox parameters can be tuned per-request or saved as a named **preset**:

| Parameter | Range | Effect |
|---|---|---|
| `temperature` | 0 – 1.5 | Randomness. Higher = more expressive, less predictable. |
| `exaggeration` | 0 – 1 | Prosody emphasis. Higher = more dramatic delivery. |
| `cfg_weight` | 0 – 1 | Guidance strength. Higher = closer to the reference voice. |
| `repetition_penalty` | 1 – 2 | Penalises repeated tokens. Higher = less looping. |
| `top_p` | 0 – 1 | Nucleus sampling cutoff. |
| `min_p` | 0 – 1 | Minimum token probability floor. |

**Override priority** (lowest → highest): built-in preset → voice profile defaults → per-request values.

## Chunking

Long text is split at sentence boundaries. `max_chars` sets the hard chunk limit (default 450, range 100–3000). Vox also reserves `VOX_CHUNK_HEADROOM_CHARS` of extra breathing room below that limit so sentence endings are less likely to get cut off or hallucinate at chunk boundaries.

## Response headers

Every TTS response includes timing telemetry:

| Header | Description |
|---|---|
| `X-Request-ID` | UUID identifying this job |
| `X-Audio-Duration-Seconds` | Length of the generated clip |
| `X-Generation-Seconds` | Time spent in the model |
| `X-RTF` | Real-time factor (generation ÷ audio duration). RTF < 1 = faster than real-time. |

## Async job lifecycle

```
POST /api/v1/tts → queued → processing → completed → audio available
                                └→ failed   → error field set
```

Audio files are automatically cleaned up after `VOX_OUTPUT_TTL_HOURS` (default 24 h).
"""

_TAGS = [
    {
        "name": "tts",
        "description": "Generate speech from text. Submission is async — you get a `request_id` immediately and poll `/api/v1/jobs/{request_id}` for completion.",
    },
    {
        "name": "voices",
        "description": "Manage voice profiles used as cloning references. Upload a short audio clip and Vox learns the tone, pace, and character of that voice.",
    },
    {
        "name": "jobs",
        "description": "Track generation jobs and download completed audio. Jobs move through `queued → processing → completed` (or `failed`).",
    },
    {
        "name": "backups",
        "description": "Export and restore Vox Studio data, including the SQLite database and voice assets.",
    },
    {
        "name": "presets",
        "description": "Named bundles of the six Chatterbox generation parameters. Built-in presets are read-only; custom presets can be created, overwritten, and deleted.",
    },
    {
        "name": "system",
        "description": "Server health, configuration, and usage statistics.",
    },
]

app = FastAPI(
    title="Vox API",
    summary="Local text-to-speech API powered by Chatterbox Turbo on Apple Silicon.",
    description=_DESCRIPTION,
    version=get_build_info()["version"],
    contact={"name": "MeloLab Dev", "url": "https://github.com/MeloLabDev/codename-vox"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
    servers=[{"url": "/api/v1", "description": "Current server"}],
    openapi_tags=_TAGS,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(RequestIDMiddleware)


@app.exception_handler(HTTPException)
async def vox_http_exception_handler(request: Request, exc: HTTPException):
    response = await http_exception_handler(request, exc)
    detail = exc.detail
    message = detail if isinstance(detail, str) else "Request failed."
    response.body = (
        json.dumps(
            {
                "detail": detail,
                "error": {
                    "code": exc.status_code,
                    "message": message,
                },
                "request_id": getattr(request.state, "request_id", None),
            }
        ).encode("utf-8")
    )
    response.headers["content-length"] = str(len(response.body))
    return response

v1 = APIRouter(prefix="/api/v1")
v1.include_router(tts.router)
v1.include_router(voices.router)
v1.include_router(jobs.router)
v1.include_router(backups.router)
v1.include_router(presets.router)
v1.include_router(logs.router)
v1.include_router(alerts.router)
v1.include_router(preferences.router)

# Serve React SPA built assets
if _UI_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_UI_DIST / "assets")), name="ui-assets")

_SPA_INDEX = _UI_DIST / "index.html"
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _spa() -> FileResponse:
    return FileResponse(str(_SPA_INDEX), media_type="text/html", headers=_NO_CACHE_HEADERS)


@app.get("/docs", include_in_schema=False)
async def scalar_docs():
    return HTMLResponse("""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vox API Reference</title>
  <style>body { margin: 0; }</style>
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script>
    document.getElementById('api-reference').dataset.configuration = JSON.stringify({
      theme: 'kepler',
      layout: 'modern',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      defaultOpenAllTags: false,
      hideModels: false,
      hiddenClients: [],
      servers: [{ url: 'http://localhost:8000', description: 'Local' }],
      metadata: {
        title: 'Vox API Reference',
      },
    })
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>""")


@app.get("/favicon.png", include_in_schema=False)
async def favicon():
    f = _UI_DIST / "favicon.png"
    if f.exists():
        return FileResponse(str(f), media_type="image/png")
    return _spa()


@app.get("/")
async def landing():
    if _SPA_INDEX.exists():
        return _spa()
    return {"status": "ok", "device": get_device(), "presets": list(PRESETS.keys())}


# Client-side routes — all must return index.html so TanStack Router handles them
@app.get("/app")
@app.get("/app/")
@app.get("/app/library")
@app.get("/app/recordings")
@app.get("/app/settings")
@app.get("/logs")
async def spa_routes():
    if _SPA_INDEX.exists():
        return _spa()
    return {"error": "UI not found"}


@app.get(
    "/health",
    tags=["system"],
    summary="Liveness check",
    description="Returns `ok` if the server process is running. Does not verify model or database state — use `GET /api/v1/settings` for a full diagnostic.",
    response_description="Server status",
)
async def health():
    model = get_model_status()
    return {
        "status": "ok",
        "device": get_device(),
        "model_state": model["state"],
        "model_ready": model["ready"],
        "presets": list(PRESETS.keys()),
        "input_dir": str(settings.input_dir),
        "output_ttl_hours": settings.output_ttl_hours,
        "max_voice_clip_duration_s": settings.max_voice_clip_duration_s,
    }


@v1.get(
    "/status",
    tags=["system"],
    summary="Runtime readiness status",
    description="Returns lightweight runtime readiness including Chatterbox model load state. This endpoint is intended for the native helper and first-run UX.",
)
async def get_status():
    return {
        "status": "ok",
        "model": get_model_status(),
    }


@v1.get(
    "/stats",
    tags=["system"],
    summary="Usage statistics",
    description="Returns aggregate counts of completed jobs and audio minutes generated — all-time and today — plus a 7-day sparkline for both metrics.",
    response_description="Usage stats with sparkline arrays",
)
async def get_stats():
    import asyncio
    from api.core.db import get_db
    db = await get_db()

    # Usage aggregates
    async with db.execute(
        """
        SELECT
            COUNT(*) AS total_requests,
            COALESCE(SUM(audio_duration_s), 0) AS total_seconds,
            COUNT(CASE WHEN date(created_at) = date('now') THEN 1 END) AS today_requests,
            COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN audio_duration_s ELSE 0 END), 0) AS today_seconds
        FROM jobs WHERE status = 'completed'
        """
    ) as cur:
        row = await cur.fetchone()
    total_requests, total_seconds, today_requests, today_seconds = row

    # Library counts
    async with db.execute("SELECT COUNT(*) FROM voices") as cur:
        (voice_count,) = await cur.fetchone()
    # Disk usage — scan both directories in a thread to avoid blocking the event loop
    def _scan_dir(path: Path) -> int:
        try:
            return sum(f.stat().st_size for f in path.iterdir() if f.is_file())
        except (FileNotFoundError, PermissionError):
            return 0

    def _count_recordings(path: Path) -> int:
        try:
            return sum(1 for f in path.iterdir() if f.is_file() and f.suffix.lower() in {".mp3", ".wav"})
        except (FileNotFoundError, PermissionError):
            return 0

    loop = asyncio.get_running_loop()
    voices_disk_bytes, recordings_disk_bytes, recording_count = await asyncio.gather(
        loop.run_in_executor(None, _scan_dir, settings.voice_dir),
        loop.run_in_executor(None, _scan_dir, settings.output_dir),
        loop.run_in_executor(None, _count_recordings, settings.output_dir),
    )

    sparkline_days = list(range(-6, 1))
    sparkline_by_day = {day: (0, 0.0) for day in sparkline_days}
    async with db.execute(
        """
        SELECT
            CAST(julianday(date(created_at)) - julianday(date('now')) AS INTEGER) AS offset_days,
            COUNT(*) AS request_count,
            COALESCE(SUM(audio_duration_s), 0) AS audio_seconds
        FROM jobs
        WHERE status='completed'
          AND date(created_at) >= date('now', '-6 days')
        GROUP BY date(created_at)
        """
    ) as cur:
        rows = await cur.fetchall()
    for sparkline_row in rows:
        offset_days = sparkline_row["offset_days"]
        if offset_days in sparkline_by_day:
            sparkline_by_day[offset_days] = (sparkline_row["request_count"], sparkline_row["audio_seconds"])

    sparkline_requests = [sparkline_by_day[day][0] for day in sparkline_days]
    sparkline_minutes = [round(sparkline_by_day[day][1] / 60, 2) for day in sparkline_days]

    return {
        "total_requests": total_requests,
        "today_requests": today_requests,
        "total_minutes": round(total_seconds / 60, 2),
        "today_minutes": round(today_seconds / 60, 2),
        "sparkline_requests": sparkline_requests,
        "sparkline_minutes": sparkline_minutes,
        # Library & storage
        "voice_count": voice_count,
        "recording_count": recording_count,
        "voices_disk_bytes": voices_disk_bytes,
        "recordings_disk_bytes": recordings_disk_bytes,
        "disk_used_bytes": voices_disk_bytes + recordings_disk_bytes,
    }


@v1.get(
    "/settings",
    tags=["system"],
    summary="Server configuration",
    description="Returns the active server configuration — resolved device (MPS/CPU), file paths, model name, FFmpeg availability, macOS version, and chip. Useful for debugging installation issues.",
    response_description="Server configuration object",
)
async def get_settings():
    import shutil, platform
    build_info = get_build_info()
    ffmpeg = settings.ffmpeg_path
    ffmpeg_ok = bool(shutil.which(ffmpeg) or shutil.which("ffmpeg"))
    configured_host = _read_env_value("VOX_HOST", settings.host) or settings.host
    configured_output_ttl_hours = _read_env_int("VOX_OUTPUT_TTL_HOURS", settings.output_ttl_hours)
    configured_max_voice_clip_duration_s = _read_env_int("VOX_MAX_VOICE_CLIP_DURATION_S", settings.max_voice_clip_duration_s)
    configured_chunk_headroom_chars = _read_env_int("VOX_CHUNK_HEADROOM_CHARS", settings.chunk_headroom_chars)
    mac_ver, _, _ = platform.mac_ver()
    try:
        import subprocess
        chip = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
    except Exception:
        chip = "Apple Silicon" if platform.machine() == "arm64" else "Intel"
    return {
        "device_config": settings.device,
        "device_resolved": get_device(),
        "host": settings.host,
        "configured_host": configured_host,
        "host_restart_required": configured_host != settings.host,
        "port": settings.port,
        "output_dir": str(settings.output_dir.resolve()),
        "voice_dir": str(settings.voice_dir.resolve()),
        "input_dir": str(settings.input_dir.resolve()),
        "output_ttl_hours": settings.output_ttl_hours,
        "configured_output_ttl_hours": configured_output_ttl_hours,
        "output_ttl_restart_required": configured_output_ttl_hours != settings.output_ttl_hours,
        "job_retention_days": settings.job_retention_days,
        "deleted_voice_ttl_hours": settings.deleted_voice_ttl_hours,
        "chunk_headroom_chars": settings.chunk_headroom_chars,
        "configured_chunk_headroom_chars": configured_chunk_headroom_chars,
        "chunk_headroom_restart_required": configured_chunk_headroom_chars != settings.chunk_headroom_chars,
        "ffmpeg_available": ffmpeg_ok,
        "ffmpeg_path": ffmpeg,
        "model_name": "Chatterbox Turbo",
        "model_state": get_model_status()["state"],
        "model_ready": get_model_status()["ready"],
        "default_max_chars": settings.default_max_chars,
        "max_voice_clip_duration_s": settings.max_voice_clip_duration_s,
        "configured_max_voice_clip_duration_s": configured_max_voice_clip_duration_s,
        "max_voice_clip_duration_restart_required": configured_max_voice_clip_duration_s != settings.max_voice_clip_duration_s,
        "voice_icon_max_kb": settings.voice_icon_max_kb,
        "macos_version": mac_ver,
        "chip": chip,
        "vox_version": build_info["version"],
        "build_commit": build_info["commit"],
        "build_built_at": build_info["built_at"],
    }


@v1.patch(
    "/settings",
    tags=["system"],
    summary="Update server configuration",
    description="Persists editable server configuration to `.env`. Host changes require restarting the local Vox server before they become active.",
)
async def patch_settings(patch: SettingsPatch):
    changed: dict[str, str] = {}

    if patch.host is not None:
        host = patch.host.strip()
        if host not in _VALID_HOSTS:
            raise HTTPException(status_code=422, detail="host must be either 127.0.0.1 or 0.0.0.0")
        _write_env_value("VOX_HOST", host)
        changed["host"] = host

    if patch.output_ttl_hours is not None:
        if patch.output_ttl_hours < 0 or patch.output_ttl_hours > 8760:
            raise HTTPException(status_code=422, detail="output_ttl_hours must be between 0 and 8760")
        _write_env_value("VOX_OUTPUT_TTL_HOURS", str(patch.output_ttl_hours))
        changed["output_ttl_hours"] = str(patch.output_ttl_hours)

    if patch.max_voice_clip_duration_s is not None:
        if patch.max_voice_clip_duration_s < 5 or patch.max_voice_clip_duration_s > 600:
            raise HTTPException(status_code=422, detail="max_voice_clip_duration_s must be between 5 and 600")
        _write_env_value("VOX_MAX_VOICE_CLIP_DURATION_S", str(patch.max_voice_clip_duration_s))
        changed["max_voice_clip_duration_s"] = str(patch.max_voice_clip_duration_s)

    if patch.chunk_headroom_chars is not None:
        if patch.chunk_headroom_chars < 0 or patch.chunk_headroom_chars > 1000:
            raise HTTPException(status_code=422, detail="chunk_headroom_chars must be between 0 and 1000")
        _write_env_value("VOX_CHUNK_HEADROOM_CHARS", str(patch.chunk_headroom_chars))
        changed["chunk_headroom_chars"] = str(patch.chunk_headroom_chars)

    configured_host = _read_env_value("VOX_HOST", settings.host) or settings.host
    configured_output_ttl_hours = _read_env_int("VOX_OUTPUT_TTL_HOURS", settings.output_ttl_hours)
    configured_max_voice_clip_duration_s = _read_env_int("VOX_MAX_VOICE_CLIP_DURATION_S", settings.max_voice_clip_duration_s)
    configured_chunk_headroom_chars = _read_env_int("VOX_CHUNK_HEADROOM_CHARS", settings.chunk_headroom_chars)
    return {
        "changed": changed,
        "host": settings.host,
        "configured_host": configured_host,
        "host_restart_required": configured_host != settings.host,
        "output_ttl_hours": settings.output_ttl_hours,
        "configured_output_ttl_hours": configured_output_ttl_hours,
        "output_ttl_restart_required": configured_output_ttl_hours != settings.output_ttl_hours,
        "max_voice_clip_duration_s": settings.max_voice_clip_duration_s,
        "configured_max_voice_clip_duration_s": configured_max_voice_clip_duration_s,
        "max_voice_clip_duration_restart_required": configured_max_voice_clip_duration_s != settings.max_voice_clip_duration_s,
        "chunk_headroom_chars": settings.chunk_headroom_chars,
        "configured_chunk_headroom_chars": configured_chunk_headroom_chars,
        "chunk_headroom_restart_required": configured_chunk_headroom_chars != settings.chunk_headroom_chars,
    }


@v1.get(
    "/presets",
    tags=["presets"],
    summary="List all tone presets",
    description="Returns all available presets — built-in (read-only) and any saved custom presets. Each preset is a dict of the six Chatterbox generation parameters. Pass a preset name as the `preset` field in `POST /api/v1/tts`.",
    response_description="Map of preset name → parameter values",
)
async def get_presets():
    from api.core.db import get_db
    db = await get_db()
    result: dict = dict(PRESETS)
    async with db.execute(
        "SELECT name, temperature, exaggeration, cfg_weight, repetition_penalty, top_p, min_p "
        "FROM user_presets ORDER BY created_at"
    ) as cur:
        rows = await cur.fetchall()
    for row in rows:
        d = dict(row)
        name = d.pop("name")
        result[name] = d
    return result


app.include_router(v1)
