from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts" / "appcast.py"


def render(
    tmp_path: Path,
    channel: str = "stable",
    build: str = "2026071001",
    version: str = "1.2.3",
    previous_build: str = "1",
    existing_appcast: Path | None = None,
) -> Path:
    package = tmp_path / f"Vox-{version}.pkg"
    package.write_bytes(b"signed package fixture")
    notes = tmp_path / "notes.md"
    notes.write_text("- A safe update\n", encoding="utf-8")
    output = tmp_path / "appcast.xml"
    subprocess.run([
        sys.executable, str(TOOL), "render", "--version", version, "--build", build,
        "--channel", channel, "--previous-build", previous_build, "--published-at", "2026-07-10T13:00:00Z", "--package", str(package),
        "--url", f"https://updates.example.test/vox/releases/Vox-{version}.pkg",
        "--notes", str(notes), "--output", str(output), "--fixture", "--signature", "fixture-signature",
    ] + (["--existing-appcast", str(existing_appcast)] if existing_appcast else []), check=True)
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


def test_verify_signature_delegates_to_sparkle_for_the_staged_package(tmp_path: Path) -> None:
    output = render(tmp_path)
    package = tmp_path / "Vox-1.2.3.pkg"
    verifier = tmp_path / "sign_update"
    verifier.write_text(
        "#!/bin/sh\n"
        "[ \"$1\" = \"--verify\" ] && [ \"$2\" = \"--account\" ] && [ \"$3\" = \"test-account\" ] && "
        "[ \"$4\" = \"%s\" ] && [ \"$5\" = \"fixture-signature\" ]\n" % package,
        encoding="utf-8",
    )
    verifier.chmod(0o755)
    subprocess.run([
        sys.executable, str(TOOL), "verify", "--appcast", str(output), "--package", str(package),
        "--verify-signature", "--sign-tool", str(verifier), "--account", "test-account",
    ], check=True)


def test_verify_signature_rejects_a_failed_sparkle_check(tmp_path: Path) -> None:
    output = render(tmp_path)
    package = tmp_path / "Vox-1.2.3.pkg"
    verifier = tmp_path / "rejecting-sign_update"
    verifier.write_text("#!/bin/sh\necho signature mismatch >&2\nexit 1\n", encoding="utf-8")
    verifier.chmod(0o755)
    failed = subprocess.run([
        sys.executable, str(TOOL), "verify", "--appcast", str(output), "--package", str(package),
        "--verify-signature", "--sign-tool", str(verifier),
    ], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "Sparkle signature verification failed" in failed.stderr


def test_verify_can_require_exact_hosted_build_and_package_url(tmp_path: Path) -> None:
    output = render(tmp_path, build="42")
    package = tmp_path / "Vox-1.2.3.pkg"
    url = "https://updates.example.test/vox/releases/Vox-1.2.3.pkg"
    subprocess.run([
        sys.executable, str(TOOL), "verify", "--appcast", str(output), "--package", str(package),
        "--build", "42", "--package-url", url,
    ], check=True)
    failed = subprocess.run([
        sys.executable, str(TOOL), "verify", "--appcast", str(output), "--build", "43",
    ], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "expected sparkle build was not found" in failed.stderr

    failed = subprocess.run([
        sys.executable, str(TOOL), "verify", "--appcast", str(output), "--expected-signature", "different",
    ], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "unexpected Sparkle EdDSA signature" in failed.stderr


def test_merge_preserves_stable_items_when_adding_a_beta_item(tmp_path: Path) -> None:
    stable = render(tmp_path, build="10")
    merged = tmp_path / "merged.xml"
    package = tmp_path / "Vox-1.2.4.pkg"
    package.write_bytes(b"beta package fixture")
    notes = tmp_path / "beta-notes.md"
    notes.write_text("- A beta update\n", encoding="utf-8")
    subprocess.run([
        sys.executable, str(TOOL), "render", "--version", "1.2.4", "--build", "11", "--previous-build", "10",
        "--channel", "beta", "--published-at", "2026-07-10T14:00:00Z", "--package", str(package),
        "--url", "https://updates.example.test/vox/releases/Vox-1.2.4.pkg", "--notes", str(notes),
        "--output", str(merged), "--existing-appcast", str(stable), "--fixture", "--signature", "fixture-signature",
    ], check=True)
    text = merged.read_text(encoding="utf-8")
    assert text.count("<item>") == 2
    subprocess.run([sys.executable, str(TOOL), "verify", "--appcast", str(merged), "--channel", "beta", "--build", "11"], check=True)
    subprocess.run([sys.executable, str(TOOL), "verify", "--appcast", str(merged), "--channel", "stable", "--build", "10"], check=True)
