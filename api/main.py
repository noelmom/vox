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
from api.routers import jobs, tts, voices

_UI_DIR = Path(__file__).parent.parent / "ui"
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

# Serve legacy ui/ folder (favicon, CSS, old JS) — kept for backwards compat during transition
if _UI_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR)), name="ui")

# Serve new React SPA built assets
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
@app.get("/app/voices")
@app.get("/app/history")
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


@app.get("/presets")
async def presets():
    return PRESETS
