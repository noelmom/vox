from pathlib import Path
import os
import subprocess


ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "scripts" / "verify-package-candidate.sh"
REQUIRED_PAYLOAD = """\
Applications/Vox/VoxHelper.app/Contents/Info.plist
Applications/Vox/VoxServer.app/Contents/Info.plist
Library/Application Support/Vox/Bootstrap/vox.sh
Library/Application Support/Vox/Bootstrap/scripts/update.sh
Library/Application Support/Vox/Bootstrap/scripts/prepare-release-candidate.sh
"""


def run_verifier(tmp_path: Path, payload: str) -> subprocess.CompletedProcess[str]:
    package = tmp_path / "Vox-1.2.3.pkg"
    package.write_bytes(b"fixture package")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in {
        "pkgutil": f"#!/bin/sh\nif [ \"$1\" = \"--payload-files\" ]; then printf '%s\\n' '{payload}'; exit 0; fi\nexit 0\n",
        "spctl": "#!/bin/sh\nexit 0\n",
        "xcrun": "#!/bin/sh\n[ \"$1\" = \"stapler\" ] && [ \"$2\" = \"validate\" ]\n",
    }.items():
        path = bin_dir / name
        path.write_text(body, encoding="utf-8")
        path.chmod(0o755)
    environment = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    return subprocess.run(["bash", str(VERIFY), str(package)], capture_output=True, text=True, env=environment)


def test_package_candidate_verifier_accepts_only_the_expected_payload(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD)
    assert result.returncode == 0, result.stderr
    assert "stapling" in result.stdout


def test_package_candidate_verifier_rejects_protected_runtime_data(tmp_path: Path) -> None:
    result = run_verifier(tmp_path, REQUIRED_PAYLOAD + "\nLibrary/Application Support/Vox/outputs/private.wav\n")
    assert result.returncode != 0
    assert "protected runtime data" in result.stderr
