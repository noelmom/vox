from pathlib import Path
import os
import subprocess


ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "scripts" / "verify-package-candidate.sh"
REQUIRED_PAYLOAD = """\
.\n./Applications\n./Applications/Vox\n./Library\n./Library/Application Support\n./Library/Application Support/Vox\n./Library/Application Support/Vox/Bootstrap\n./Library/Application Support/Vox/Bootstrap/api\n./Library/Application Support/Vox/Bootstrap/ui-dist\n./Library/Application Support/Vox/Bootstrap/scripts\n./Library/Application Support/Vox/Bootstrap/voices
./Applications/Vox/VoxHelper.app/Contents/Info.plist
./Applications/Vox/VoxServer.app/Contents/Info.plist
./Library/Application Support/Vox/Bootstrap/vox.sh
./Library/Application Support/Vox/Bootstrap/scripts/update.sh
./Library/Application Support/Vox/Bootstrap/scripts/prepare-release-candidate.sh
./Library/Application Support/Vox/Bootstrap/._setup.sh
"""


def run_verifier(
    tmp_path: Path,
    payload: str,
    *,
    missing_current_symlink: bool = False,
    missing_sparkle_executable: bool = False,
    missing_framework_rpath: bool = False,
) -> subprocess.CompletedProcess[str]:
    package = tmp_path / "Vox-1.2.3.pkg"
    package.write_bytes(b"fixture package")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name, body in {
        "pkgutil": f"#!/bin/sh\nif [ \"$1\" = \"--payload-files\" ]; then printf '%s\\n' '{payload}'; exit 0; fi\nif [ \"$1\" = \"--expand-full\" ]; then root=\"$3/Payload/Applications/Vox/VoxHelper.app/Contents\"; mkdir -p \"$root/Frameworks/Sparkle.framework/Versions/B\" \"$root/MacOS\"; [ \"${{VOX_TEST_NO_SPARKLE:-}}\" = 1 ] || touch \"$root/Frameworks/Sparkle.framework/Versions/B/Sparkle\"; touch \"$root/MacOS/VoxHelper\"; [ \"${{VOX_TEST_NO_CURRENT:-}}\" = 1 ] || ln -s B \"$root/Frameworks/Sparkle.framework/Versions/Current\"; exit 0; fi\nexit 0\n",
        "spctl": "#!/bin/sh\nexit 0\n",
        "xcrun": "#!/bin/sh\n[ \"$1\" = \"stapler\" ] && [ \"$2\" = \"validate\" ]\n",
        "otool": "#!/bin/sh\nif [ \"$1\" = \"-l\" ]; then [ \"${VOX_TEST_NO_FRAMEWORK_RPATH:-}\" = 1 ] || printf '          cmd LC_RPATH\\n         path @executable_path/../Frameworks (offset 12)\\n'; exit 0; fi\necho '@rpath/Sparkle.framework/Versions/A/Sparkle'\n",
    }.items():
        path = bin_dir / name
        path.write_text(body, encoding="utf-8")
        path.chmod(0o755)
    environment = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "VOX_TEST_NO_CURRENT": "1" if missing_current_symlink else "",
        "VOX_TEST_NO_SPARKLE": "1" if missing_sparkle_executable else "",
        "VOX_TEST_NO_FRAMEWORK_RPATH": "1" if missing_framework_rpath else "",
    }
    return subprocess.run(["bash", str(VERIFY), str(package)], capture_output=True, text=True, env=environment)


def test_package_candidate_verifier_accepts_only_the_expected_payload(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD)
    assert result.returncode == 0, result.stderr
    assert "stapling" in result.stdout


def test_package_candidate_verifier_rejects_protected_runtime_data(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD + "Library/Application Support/Vox/outputs/private.wav\n")
    assert result.returncode != 0
    assert "protected runtime data" in result.stderr


def test_package_candidate_verifier_rejects_unexpected_and_secret_payloads(tmp_path: Path) -> None:
    unexpected = run_verifier(tmp_path, REQUIRED_PAYLOAD + "Library/Application Support/Vox/Bootstrap/developer-notes.txt\n")
    assert unexpected.returncode != 0
    assert "unexpected package payload" in unexpected.stderr

    secret = run_verifier(tmp_path, REQUIRED_PAYLOAD + "Library/Application Support/Vox/Bootstrap/api/.env\n")
    assert secret.returncode != 0
    assert "development, cache, or secret material" in secret.stderr


def test_package_candidate_verifier_requires_embedded_sparkle_runtime(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD, missing_sparkle_executable=True)
    assert result.returncode != 0
    assert "Sparkle framework executable" in result.stderr


def test_package_candidate_verifier_requires_sparkle_current_symlink(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD, missing_current_symlink=True)
    assert result.returncode != 0
    assert "Current symlink" in result.stderr


def test_package_candidate_verifier_requires_framework_runtime_rpath(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD, missing_framework_rpath=True)
    assert result.returncode != 0
    assert "@executable_path/../Frameworks" in result.stderr
