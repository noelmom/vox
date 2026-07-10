import sys
import types

from fastapi.testclient import TestClient


def _install_model_stubs(monkeypatch):
    torch = types.ModuleType("torch")
    torch.backends = types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: False))
    torch.device = lambda device: device
    torch.load = lambda *args, **kwargs: None

    chatterbox = types.ModuleType("chatterbox")
    chatterbox_tts = types.ModuleType("chatterbox.tts")

    class ChatterboxTTS:
        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            return cls()

    chatterbox_tts.ChatterboxTTS = ChatterboxTTS

    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "chatterbox", chatterbox)
    monkeypatch.setitem(sys.modules, "chatterbox.tts", chatterbox_tts)


def test_http_errors_keep_detail_and_add_structured_shape(monkeypatch):
    _install_model_stubs(monkeypatch)

    from api.main import app

    client = TestClient(app, client=("127.0.0.1", 50000), headers={"Host": "localhost:8000"})
    response = client.patch("/api/v1/settings", json={"host": "example.com"})

    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "host must be either 127.0.0.1 or 0.0.0.0"
    assert body["error"]["code"] == 422
    assert body["error"]["message"] == body["detail"]
    assert body["request_id"]


def test_loopback_startup_revokes_credentials_created_in_an_earlier_lan_session(monkeypatch, tmp_path):
    _install_model_stubs(monkeypatch)

    from api.core.security import SecurityStore
    from api.main import _enforce_lan_credential_state, app, settings

    store = SecurityStore(tmp_path / "security.db")
    token = store.create_api_token("Old LAN token", scopes={"read"})
    monkeypatch.setattr(app.state, "security_store", store)
    monkeypatch.setattr(settings, "host", "127.0.0.1")

    _enforce_lan_credential_state(app)

    assert store.authenticate(token.secret) is None
