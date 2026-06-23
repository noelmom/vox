import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
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


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    servers=[
        {"url": "/", "description": "Current server"},
    ],
    swagger_ui_parameters={"defaultModelsExpandDepth": 0},
    swagger_css_url="data:text/css,.swagger-ui .models { background: #f5f5f5 !important; } .swagger-ui .models h4 { color: #1d1d1f !important; } .swagger-ui .models h5 { color: #1d1d1f !important; } .swagger-ui .models .model-title { color: #1d1d1f !important; } .swagger-ui .models a { color: #0066cc !important; text-decoration: underline !important; } .swagger-ui .models a:hover { color: #004499 !important; } .swagger-ui .models .model-box { background: #fff !important; } .swagger-ui .models .model-box td { color: #1d1d1f !important; } .swagger-ui .models .model-container { border-color: #ccc !important; color: #1d1d1f !important; }",
)

app.add_middleware(RequestIDMiddleware)

app.include_router(tts.router)
app.include_router(voices.router)
app.include_router(jobs.router)
app.include_router(presets.router)

# Serve React SPA built assets
if _UI_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_UI_DIST / "assets")), name="ui-assets")

_SPA_INDEX = _UI_DIST / "index.html"


def _spa() -> FileResponse:
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


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": get_device(),
        "presets": list(PRESETS.keys()),
        "input_dir": str(settings.input_dir),
        "output_ttl_hours": settings.output_ttl_hours,
    }


@app.get("/stats")
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


@app.get("/settings")
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


@app.get("/presets")
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
