import tempfile
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.core.security import SecurityStore  # noqa: E402
from api.middleware.security import SecurityMiddleware
from api.routers import auth


class RemoteClientForBrowserTests:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        if headers.get(b"x-test-remote") == b"1":
            scope = dict(scope)
            scope["client"] = ("192.168.1.20", 50000)
        await self.app(scope, receive, send)


app = FastAPI()
security_dir = Path(tempfile.mkdtemp(prefix="vox-pairing-browser-"))
app.state.security_store = SecurityStore(security_dir / "security.db")
app.add_middleware(SecurityMiddleware, lan_enabled=lambda: True)
app.add_middleware(RemoteClientForBrowserTests)
app.include_router(auth.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "private": "must not reach remote clients"}


@app.get("/pair")
async def pair():
    return auth.pairing_page()


@app.get("/app")
async def studio():
    return HTMLResponse("<main><h1>Vox Studio paired</h1></main>")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4181, log_level="warning")
