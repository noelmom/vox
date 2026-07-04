import sys
import types


def test_app_schema_exposes_status_and_settings(monkeypatch):
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

    from api.main import app

    schema = app.openapi()

    assert schema["info"]["version"]
    assert "/api/v1/status" in schema["paths"]
    assert "/api/v1/settings" in schema["paths"]
    assert "/api/v1/preferences" in schema["paths"]
