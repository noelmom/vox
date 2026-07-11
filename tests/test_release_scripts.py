from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def test_release_finalizer_refuses_to_publish_without_both_explicit_guards() -> None:
    result = subprocess.run(
        ["bash", str(ROOT / "scripts" / "release.sh"), "1.2.3"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "require --publish and VOX_RELEASE_PUBLISH=1" in result.stderr


def test_hosted_candidate_probe_requires_immutable_candidate_evidence() -> None:
    result = subprocess.run(
        ["bash", str(ROOT / "scripts" / "verify-published-candidate.sh")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "usage:" in result.stderr
