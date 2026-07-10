import sys
import types

import numpy as np


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


def test_stitch_chunks_applies_pause_after_current_chunk(monkeypatch):
    _install_model_stubs(monkeypatch)
    from api.core.generation import _stitch_chunks

    first = np.array([1.0, 1.0], dtype=np.float32)
    second = np.array([2.0], dtype=np.float32)
    third = np.array([3.0], dtype=np.float32)

    result = _stitch_chunks([(first, 0.2), (second, 0.0), (third, 0.0)], sample_rate=10)

    np.testing.assert_array_equal(result, np.array([1.0, 1.0, 0.0, 0.0, 2.0, 3.0], dtype=np.float32))


def test_stitch_chunks_handles_empty_segments(monkeypatch):
    _install_model_stubs(monkeypatch)
    from api.core.generation import _stitch_chunks

    result = _stitch_chunks([(np.array([], dtype=np.float32), 0.1), (np.array([4.0], dtype=np.float32), 0.0)], 10)

    np.testing.assert_array_equal(result, np.array([4.0], dtype=np.float32))
