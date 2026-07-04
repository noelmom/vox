from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.middleware.request_id import RequestIDMiddleware


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    return TestClient(app)


def test_request_id_header_is_preserved():
    response = _client().get("/ping", headers={"X-Request-ID": "test-request"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-request"


def test_request_id_header_is_generated():
    response = _client().get("/ping")

    assert response.status_code == 200
    assert response.headers["X-Request-ID"]
