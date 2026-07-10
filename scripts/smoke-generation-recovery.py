#!/usr/bin/env python3
"""Manual Apple Silicon smoke test for cancel/reap/recover.

Run against an installed, ready Vox instance. It cancels one long render, waits
for truthful terminal state, then verifies a second render can complete.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = os.environ.get("VOX_SMOKE_BASE_URL", "http://127.0.0.1:8000")
TOKEN = os.environ.get("VOX_SMOKE_TOKEN")


def request(path: str, *, fields: dict[str, str] | None = None):
    data = urllib.parse.urlencode(fields).encode() if fields is not None else None
    headers = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}
    with urllib.request.urlopen(urllib.request.Request(f"{BASE}{path}", data=data, headers=headers), timeout=30) as response:
        return json.load(response)


def wait_for(request_id: str, wanted: set[str], timeout: float = 120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = request(f"/api/v1/jobs/{request_id}")
        print(f"{request_id[:8]} {job['status']}: {job.get('state_detail') or ''}")
        if job["status"] in wanted:
            return job
        time.sleep(0.75)
    raise TimeoutError(f"Timed out waiting for {wanted}")


def pid_exists(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def main() -> int:
    status = request("/api/v1/status")
    if not status["model"]["ready"]:
        print("Vox model is not ready; start the installed app and retry.", file=sys.stderr)
        return 2
    original_pid = status["model"].get("worker_pid")
    long_job = request("/api/v1/tts", fields={"text": "Recovery test. " * 300, "output_format": "wav"})
    wait_for(long_job["request_id"], {"processing"})
    cancel = request(f"/api/v1/tts/{long_job['request_id']}/cancel", fields={})
    if cancel["status"] not in {"cancelling", "cancelled"}:
        raise RuntimeError(f"Unexpected cancel response: {cancel}")
    wait_for(long_job["request_id"], {"cancelled"})
    if pid_exists(original_pid):
        raise RuntimeError(f"Original model worker PID {original_pid} is still alive after cancellation.")
    wait_for_model = time.monotonic() + 300
    recovered = None
    while time.monotonic() < wait_for_model:
        recovered = request("/api/v1/status")["model"]
        if recovered["ready"] and recovered.get("worker_pid") != original_pid:
            break
        time.sleep(1)
    if not recovered or not recovered["ready"] or recovered.get("worker_pid") == original_pid:
        raise RuntimeError("A distinct replacement worker did not become ready.")
    retry = request("/api/v1/tts", fields={"text": "Vox recovered successfully.", "output_format": "wav"})
    result = wait_for(retry["request_id"], {"completed", "failed"}, timeout=300)
    if result["status"] != "completed":
        raise RuntimeError(result.get("error") or "Recovery render failed")
    print("Generation cancellation and MPS recovery smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
