import json

from api.core import build_info


def test_get_build_info_uses_json_when_present(tmp_path, monkeypatch):
    root = tmp_path
    (root / "VERSION").write_text("9.9.9-test\n", encoding="utf-8")
    (root / "build_info.json").write_text(
        json.dumps({
            "version": "1.2.3-test",
            "commit": "abc1234",
            "built_at": "2026-06-28T00:00:00Z",
        }),
        encoding="utf-8",
    )

    monkeypatch.setattr(build_info, "_ROOT", root)

    assert build_info.get_build_info() == {
        "version": "1.2.3-test",
        "commit": "abc1234",
        "built_at": "2026-06-28T00:00:00Z",
    }


def test_get_build_info_falls_back_to_version_file(tmp_path, monkeypatch):
    (tmp_path / "VERSION").write_text("2.0.0-beta\n", encoding="utf-8")
    monkeypatch.setattr(build_info, "_ROOT", tmp_path)

    assert build_info.get_build_info() == {
        "version": "2.0.0-beta",
        "commit": "unknown",
        "built_at": "unknown",
    }
