#!/bin/bash
# Run Vox's complete developer CI locally without consuming hosted runner minutes.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
UI="$ROOT/ui-src"
CI_DIR="$ROOT/.ci"
VENV="$CI_DIR/venv"
RUN_ID="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$CI_DIR/results/$RUN_ID"
RESULTS_TSV="$RUN_DIR/results.tsv"
CLEAN=false

usage() {
  echo "Usage: bash scripts/ci-local.sh [--clean]"
  echo "  --clean  remove project-local dependency/build caches before running"
}

for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if $CLEAN; then
  rm -rf "$VENV" "$UI/node_modules" "$UI/coverage" "$UI/playwright-report" "$UI/test-results" "$ROOT/.build"
fi

mkdir -p "$RUN_DIR"
: > "$RESULTS_TSV"
FAILURES=0

run_check() {
  local name="$1"
  shift
  local slug
  slug="$(printf '%s' "$name" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9_-')"
  local log="$RUN_DIR/$slug.log"

  echo
  echo "==> $name"
  set +e
  "$@" 2>&1 | tee "$log"
  local status=${PIPESTATUS[0]}
  set -e
  if [[ $status -eq 0 ]]; then
    printf '%s\tpass\t%s\n' "$name" "$log" >> "$RESULTS_TSV"
  else
    printf '%s\tfail\t%s\n' "$name" "$log" >> "$RESULTS_TSV"
    FAILURES=$((FAILURES + 1))
  fi
}

ensure_python() {
  local bootstrap_python="${VOX_CI_PYTHON:-}"
  if [[ -z "$bootstrap_python" ]]; then
    local candidate
    for candidate in \
      "/opt/homebrew/opt/python@3.11/bin/python3.11" \
      "$HOME/Library/Application Support/Vox/venv/bin/python3" \
      "$(command -v python3.11 2>/dev/null || true)"; do
      if [[ -x "$candidate" ]] && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
        bootstrap_python="$candidate"
        break
      fi
    done
  fi
  if [[ -z "$bootstrap_python" ]]; then
    echo "Python 3.11 or newer is required (set VOX_CI_PYTHON to override)." >&2
    return 1
  fi
  if [[ ! -x "$VENV/bin/python" ]]; then
    "$bootstrap_python" -m venv "$VENV"
  fi
  "$VENV/bin/python" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' || {
    echo "Existing CI environment is older than Python 3.11; rerun with --clean." >&2
    return 1
  }
  "$VENV/bin/python" -m pip install --disable-pip-version-check --quiet \
    -r "$ROOT/requirements-ci-lock.txt"
}

install_browser() {
  cd "$UI" && npx playwright install chromium
}

shell_syntax() {
  cd "$ROOT" || return
  local scripts=(vox.sh setup.sh pkg-scripts/preinstall pkg-scripts/postinstall scripts/*.sh)
  bash -n "${scripts[@]}"
}

shell_static() {
  command -v shellcheck >/dev/null 2>&1 || {
    echo "shellcheck is required (macOS: brew install shellcheck)" >&2
    return 1
  }
  cd "$ROOT" || return
  shellcheck --severity=warning vox.sh setup.sh pkg-scripts/preinstall pkg-scripts/postinstall scripts/*.sh
}

swift_compile() {
  mkdir -p "$CI_DIR/build"
  cd "$ROOT" || return
  swift build --configuration release --arch arm64 &&
  swiftc -target arm64-apple-macos13.0 \
    voxserver/main.swift -o "$CI_DIR/build/VoxServer-test"
}

ui_dist_clean() {
  cd "$ROOT" || return
  [[ -z "$(git status --porcelain --untracked-files=all -- ui-dist)" ]] || {
    git status --short --untracked-files=all -- ui-dist
    return 1
  }
}

write_summary() {
  python3 - "$RESULTS_TSV" "$RUN_DIR/summary.json" "$RUN_ID" "$CLEAN" <<'PY'
import json
import platform
import subprocess
import sys
from pathlib import Path

tsv_path, output_path, run_id, clean = sys.argv[1:5]
checks = []
for line in Path(tsv_path).read_text().splitlines():
    name, status, log = line.split("\t", 2)
    checks.append({"name": name, "status": status, "log": log})

def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()

payload = {
    "run_id": run_id,
    "clean": clean == "true",
    "commit": command("git", "rev-parse", "HEAD"),
    "branch": command("git", "branch", "--show-current"),
    "platform": platform.platform(),
    "checks": checks,
    "passed": all(check["status"] == "pass" for check in checks),
}
Path(output_path).write_text(json.dumps(payload, indent=2) + "\n")
print(f"Summary: {output_path}")
PY
}

run_check "Python environment" ensure_python
PYTHON="$VENV/bin/python"
export PAIRING_TEST_PYTHON="$PYTHON"
run_check "Frontend dependencies" npm --prefix "$UI" ci
run_check "Playwright browser" install_browser
run_check "Backend lint" "$PYTHON" -m ruff check "$ROOT/api" "$ROOT/tests"
run_check "Backend tests" "$PYTHON" -m pytest "$ROOT/tests"
run_check "Spelling" "$VENV/bin/codespell" --skip "$ROOT/.git,$ROOT/.ci,$ROOT/assets,$ROOT/data,$ROOT/input,$ROOT/outputs,$ROOT/ui-dist,$ROOT/ui-src/node_modules,$ROOT/ui-src/package-lock.json,$ROOT/voices,$ROOT/working-poc" "$ROOT"
run_check "Frontend lint" npm --prefix "$UI" run lint
run_check "Frontend typecheck" npm --prefix "$UI" run typecheck
run_check "Frontend unit tests" npm --prefix "$UI" run test:unit
run_check "Frontend accessibility tests" npm --prefix "$UI" run test:a11y
run_check "Frontend build" npm --prefix "$UI" run build
run_check "Frontend end-to-end tests" npm --prefix "$UI" run test:e2e
run_check "Generated UI clean" ui_dist_clean
run_check "Shell syntax" shell_syntax
run_check "Shell static analysis" shell_static
run_check "Swift compile" swift_compile

write_summary

if [[ $FAILURES -ne 0 ]]; then
  echo "$FAILURES check(s) failed." >&2
  exit 1
fi

echo "All local CI checks passed."
