import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.core.cleanup import run_cleanup_loop
from api.core.config import settings
from api.core.db import connect, disconnect
from api.core.engine import get_device, load_model
from api.core.logger import setup_logging
from api.core.presets import PRESETS
from api.core.watcher import watch_input_folder
from api.middleware.request_id import RequestIDMiddleware
from api.routers import jobs, presets, tts, voices

_UI_DIST = Path(__file__).parent.parent / "ui-dist"

_background_tasks: list[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await connect()
    load_model()

    _background_tasks.append(asyncio.create_task(watch_input_folder()))
    _background_tasks.append(asyncio.create_task(run_cleanup_loop()))

    yield

    for task in _background_tasks:
        task.cancel()
    await asyncio.gather(*_background_tasks, return_exceptions=True)
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
    version="0.5.0",
    contact={"name": "MeloLab Dev", "url": "https://github.com/MeloLabDev/codename-vox"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
    servers=[{"url": "/api/v1", "description": "Current server"}],
    openapi_tags=_TAGS,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(RequestIDMiddleware)

v1 = APIRouter(prefix="/api/v1")
v1.include_router(tts.router)
v1.include_router(voices.router)
v1.include_router(jobs.router)
v1.include_router(presets.router)

# Serve React SPA built assets
if _UI_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_UI_DIST / "assets")), name="ui-assets")

_SPA_INDEX = _UI_DIST / "index.html"


def _spa() -> FileResponse:
    return FileResponse(str(_SPA_INDEX), media_type="text/html")


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
    return FileResponse(str(_SPA_INDEX), media_type="text/html")


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
    return {
        "status": "ok",
        "device": get_device(),
        "presets": list(PRESETS.keys()),
        "input_dir": str(settings.input_dir),
        "output_ttl_hours": settings.output_ttl_hours,
    }


@v1.get(
    "/stats",
    tags=["system"],
    summary="Usage statistics",
    description="Returns aggregate counts of completed jobs and audio minutes generated — all-time and today — plus a 7-day sparkline for both metrics.",
    response_description="Usage stats with sparkline arrays",
)
async def get_stats():
    from api.core.db import get_db
    db = await get_db()
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

    sparkline_requests = []
    sparkline_minutes = []
    for i in range(6, -1, -1):
        async with db.execute(
            "SELECT COUNT(*), COALESCE(SUM(audio_duration_s), 0) FROM jobs WHERE status='completed' AND date(created_at) = date('now', ? || ' days')",
            (f"-{i}",),
        ) as cur:
            cnt, secs = await cur.fetchone()
        sparkline_requests.append(cnt)
        sparkline_minutes.append(round(secs / 60, 2))

    return {
        "total_requests": total_requests,
        "today_requests": today_requests,
        "total_minutes": round(total_seconds / 60, 2),
        "today_minutes": round(today_seconds / 60, 2),
        "sparkline_requests": sparkline_requests,
        "sparkline_minutes": sparkline_minutes,
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
    ffmpeg = settings.ffmpeg_path
    ffmpeg_ok = bool(shutil.which(ffmpeg) or shutil.which("ffmpeg"))
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
        "port": settings.port,
        "output_dir": str(settings.output_dir.resolve()),
        "voice_dir": str(settings.voice_dir.resolve()),
        "input_dir": str(settings.input_dir.resolve()),
        "output_ttl_hours": settings.output_ttl_hours,
        "ffmpeg_available": ffmpeg_ok,
        "ffmpeg_path": ffmpeg,
        "model_name": "Chatterbox Turbo",
        "default_max_chars": settings.default_max_chars,
        "macos_version": mac_ver,
        "chip": chip,
        "vox_version": "0.4.0",
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
