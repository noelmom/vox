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


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(RequestIDMiddleware)

app.include_router(tts.router)
app.include_router(voices.router)
app.include_router(jobs.router)

# Serve the UI assets (CSS, JS, etc.) — must come before the catch-all routes
if _UI_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR)), name="ui")


@app.get("/")
async def landing():
    index = _UI_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    return {"status": "ok", "device": get_device(), "presets": list(PRESETS.keys())}


@app.get("/app")
async def ui_app():
    app_html = _UI_DIR / "app.html"
    if app_html.exists():
        return FileResponse(str(app_html), media_type="text/html")
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
