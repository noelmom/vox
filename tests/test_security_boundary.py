from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.core.security import SecurityStore
from api.middleware.security import SecurityMiddleware
from api.routers import auth


def _app(tmp_path, *, lan_enabled: bool = True) -> tuple[FastAPI, SecurityStore]:
    app = FastAPI()
    store = SecurityStore(tmp_path / "security.db")
    app.state.security_store = store
    app.add_middleware(SecurityMiddleware, lan_enabled=lambda: lan_enabled)
    app.include_router(auth.router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        return {"status": "ok", "private": "hidden by middleware"}

    @app.get("/api/v1/status")
    async def status():
        return {"status": "ok"}

    @app.post("/api/v1/tts")
    async def generate():
        return {"status": "queued"}

    @app.patch("/api/v1/settings")
    async def settings():
        return {"status": "saved"}

    return app, store


def test_loopback_clients_remain_token_free(tmp_path):
    app, _ = _app(tmp_path)
    client = TestClient(app, client=("127.0.0.1", 50000), headers={"Host": "localhost:8000"})

    assert client.get("/api/v1/status").status_code == 200
    assert client.post("/api/v1/tts").status_code == 200


def test_remote_clients_see_only_minimal_liveness_until_authenticated(tmp_path):
    app, _ = _app(tmp_path)
    client = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})

    assert client.get("/health").json() == {"status": "ok"}
    response = client.get("/api/v1/status")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "pairing_required"


def test_remote_access_is_rejected_when_lan_mode_is_off(tmp_path):
    app, _ = _app(tmp_path, lan_enabled=False)
    client = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})

    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/status").status_code == 403


def test_host_and_cross_site_mutations_are_rejected(tmp_path):
    app, _ = _app(tmp_path)
    local = TestClient(app, client=("127.0.0.1", 50000), headers={"Host": "localhost:8000"})

    assert local.get("/api/v1/status", headers={"Host": "attacker.example"}).status_code == 400
    response = local.post(
        "/api/v1/tts",
        headers={
            "Host": "localhost:8000",
            "Origin": "https://attacker.example",
            "Sec-Fetch-Site": "cross-site",
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "cross_site_request"
    assert local.post(
        "/api/v1/tts",
        headers={"Host": "localhost:8000", "Origin": "null"},
    ).status_code == 403
    assert local.post(
        "/api/v1/tts",
        headers={"Host": "localhost:8000", "Origin": "http://["},
    ).status_code == 403


def test_pairing_code_is_single_use_and_scopes_are_enforced(tmp_path):
    app, store = _app(tmp_path)
    assert (tmp_path / "security.db").stat().st_mode & 0o777 == 0o600
    assert tmp_path.stat().st_mode & 0o077 == 0
    code = store.create_pairing_code(ttl_seconds=60)
    session = store.redeem_pairing_code(code.value, "Kitchen iPad")

    assert session is not None
    assert store.redeem_pairing_code(code.value, "Second device") is None

    client = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})
    client.cookies.set("vox_session", session.secret)
    assert client.get("/api/v1/status").status_code == 200
    assert client.post("/api/v1/tts").status_code == 200
    assert client.patch("/api/v1/settings").status_code == 200

    generate_token = store.create_api_token("Generator", scopes={"generate"})
    token_client = TestClient(app, client=("192.168.1.21", 50000), headers={"Host": "192.168.1.10:8000"})
    token_headers = {"Authorization": f"Bearer {generate_token.secret}"}
    assert token_client.post("/api/v1/tts", headers=token_headers).status_code == 200
    assert token_client.patch("/api/v1/settings", headers=token_headers).status_code == 403


def test_token_revocation_and_lan_disable_invalidate_credentials(tmp_path):
    app, store = _app(tmp_path)
    token = store.create_api_token("Automation", scopes={"read"})
    client = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})
    headers = {"Authorization": f"Bearer {token.secret}"}

    assert client.get("/api/v1/status", headers=headers).status_code == 200
    store.revoke_credential(token.id)
    assert client.get("/api/v1/status", headers=headers).status_code == 401

    session = store.redeem_pairing_code(store.create_pairing_code().value, "iPad")
    assert session is not None
    store.revoke_all_remote_credentials()
    client.cookies.set("vox_session", session.secret)
    assert client.get("/api/v1/status").status_code == 401


def test_pairing_endpoint_sets_a_private_cookie_and_never_lists_secrets(tmp_path):
    app, _ = _app(tmp_path)
    local = TestClient(app, client=("127.0.0.1", 50000), headers={"Host": "localhost:8000"})
    remote = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})

    code = local.post("/api/v1/auth/pairing-codes").json()["code"]
    response = remote.post(
        "/api/v1/auth/pair",
        json={"code": code, "device_name": "Kitchen iPad"},
    )

    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert response.json()["transport_warning"]
    credentials = local.get("/api/v1/auth/credentials").json()
    assert credentials[0]["name"] == "Kitchen iPad"
    assert "secret" not in credentials[0]
    assert "token" not in credentials[0]


def test_pairing_expiry_and_attempt_limit_do_not_consume_a_valid_code(tmp_path):
    _, store = _app(tmp_path)
    expired = store.create_pairing_code(ttl_seconds=-1)
    assert store.redeem_pairing_code(expired.value, "Late", client_id="expired-client") is None

    valid = store.create_pairing_code()
    for _ in range(5):
        assert store.redeem_pairing_code("0000-0000", "Guess", client_id="attacker") is None
    assert store.redeem_pairing_code(valid.value, "Blocked", client_id="attacker") is None

    # Rate limiting one source must not consume a valid code for another device.
    assert store.redeem_pairing_code(valid.value, "Allowed", client_id="other-client") is not None


def test_read_scope_cannot_download_private_audio(tmp_path):
    app, store = _app(tmp_path)

    @app.get("/api/v1/voices/example/audio")
    async def voice_audio():
        return {"private": True}

    token = store.create_api_token("Read only", scopes={"read"})
    client = TestClient(app, client=("192.168.1.20", 50000), headers={"Host": "192.168.1.10:8000"})
    response = client.get(
        "/api/v1/voices/example/audio",
        headers={"Authorization": f"Bearer {token.secret}"},
    )
    assert response.status_code == 403
