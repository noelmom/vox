from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts" / "appcast.py"


def render(tmp_path: Path, channel: str = "stable", build: str = "2026071001") -> Path:
    package = tmp_path / "Vox-1.2.3.pkg"
    package.write_bytes(b"signed package fixture")
    notes = tmp_path / "notes.md"
    notes.write_text("- A safe update\n", encoding="utf-8")
    output = tmp_path / "appcast.xml"
    subprocess.run([
        sys.executable, str(TOOL), "render", "--version", "1.2.3", "--build", build,
        "--channel", channel, "--previous-build", "1", "--published-at", "2026-07-10T13:00:00Z", "--package", str(package),
        "--url", "https://updates.example.test/vox/releases/Vox-1.2.3.pkg",
        "--notes", str(notes), "--output", str(output), "--fixture", "--signature", "fixture-signature",
    ], check=True)
    return output


def test_renders_and_verifies_stable_package_appcast(tmp_path: Path) -> None:
    output = render(tmp_path)
    assert "sparkle:version" in output.read_text(encoding="utf-8")
    subprocess.run([sys.executable, str(TOOL), "verify", "--appcast", str(output), "--channel", "stable"], check=True)


def test_renders_beta_channel_and_rejects_version_regression(tmp_path: Path) -> None:
    output = render(tmp_path, channel="beta", build="22")
    assert ">beta<" in output.read_text(encoding="utf-8")
    failed = subprocess.run([sys.executable, str(TOOL), "verify", "--appcast", str(output), "--channel", "beta", "--previous-build", "22"], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "not newer" in failed.stderr


def test_fixture_rendering_is_deterministic_and_missing_package_is_controlled(tmp_path: Path) -> None:
    first = render(tmp_path)
    first_bytes = first.read_bytes()
    second = render(tmp_path)
    assert second.read_bytes() == first_bytes
    failed = subprocess.run([sys.executable, str(TOOL), "verify", "--appcast", str(first), "--package", str(tmp_path / "missing.pkg")], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "existing .pkg" in failed.stderr
