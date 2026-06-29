#!/bin/bash
# Pull the latest changes and restart both agents.
#
# Git repo:    bash scripts/update.sh [--force] [--no-restart]
# Zip install: bash scripts/update.sh /path/to/new-vox-folder [--force]
#
# Safe to re-run — install scripts unload before reloading.
# User data (.env, voices/, outputs/, data/, input/) is never touched.
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[vox]${RESET} $*"; }
success() { echo -e "${GREEN}[vox] ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}[vox] ⚠ $*${RESET}"; }
fail()    { echo -e "${RED}[vox] ✗ $*${RESET}"; exit 1; }
require_git() {
    if command -v git &>/dev/null && xcode-select -p &>/dev/null; then
        return 0
    fi

    fail "Git/Xcode Command Line Tools are required for this action. Run: xcode-select --install"
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
ZIP_SRC="${1:-}"
FORCE=false
NO_RESTART=false
AGENT_ONLY=false
HELPER_ONLY=false

args=("$@")
ZIP_SRC=""
for ((i = 0; i < ${#args[@]}; i++)); do
    case "${args[$i]}" in
        --force) FORCE=true ;;
        --no-restart) NO_RESTART=true ;;
        --agent-only) AGENT_ONLY=true ;;
        --helper-only) HELPER_ONLY=true ;;
        --*) fail "Unknown option: ${args[$i]}" ;;
        *) ZIP_SRC="${args[$i]}" ;;
    esac
done

source_id() {
    if [[ -d "$ROOT/.git" ]] || [[ -f "$ROOT/.git" ]]; then
        git -C "$ROOT" rev-parse --short HEAD 2>/dev/null && return 0
    fi
    if [[ -f "$ROOT/build_info.json" ]]; then
        "$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit","unknown"))' "$ROOT/build_info.json" 2>/dev/null && return 0
    fi
    echo "unknown"
}

write_installed_version() {
    local source_commit="$1"
    local version="unknown"
    if [[ -f "$ROOT/VERSION" ]]; then
        version="$(tr -d '[:space:]' < "$ROOT/VERSION")"
    fi
    "$VENV/bin/python3" - "$APP_SUPPORT/installed_version.json" "$version" "$source_commit" <<'PY'
import json, sys
from datetime import datetime, timezone
path, version, commit = sys.argv[1:4]
with open(path, "w", encoding="utf-8") as f:
    json.dump({
        "version": version,
        "source_commit": commit,
        "installed_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }, f, indent=2)
    f.write("\n")
PY
}

installed_source_id() {
    if [[ -f "$APP_SUPPORT/installed_version.json" ]]; then
        "$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("source_commit",""))' "$APP_SUPPORT/installed_version.json" 2>/dev/null && return 0
    fi
    if [[ -f "$APP_SUPPORT/build_info.json" ]]; then
        "$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit",""))' "$APP_SUPPORT/build_info.json" 2>/dev/null && return 0
    fi
    echo ""
}

cd "$ROOT"

# ── Verify this is an existing install ────────────────────────────────────────
if [[ ! -f "$VENV/bin/pip" ]]; then
    fail "Virtual environment not found at $VENV. Run 'bash setup.sh' first."
fi

# ── Pull or copy new source files ─────────────────────────────────────────────
BRANCH=""
if [[ -n "$ZIP_SRC" ]]; then
    [[ -d "$ZIP_SRC" ]] || fail "Source folder not found: $ZIP_SRC"
    info "Copying source files from $ZIP_SRC..."
    rsync -a \
        --exclude='.env' \
        --exclude='.venv' \
        --exclude='data/' \
        --exclude='voices/' \
        --exclude='outputs/' \
        --exclude='input/' \
        "$ZIP_SRC/" "$ROOT/"
    success "Source files updated from zip"
else
    if [[ -d "$ROOT/.git" ]] || [[ -f "$ROOT/.git" ]]; then
        require_git
        BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
        if [[ -z "$BRANCH" ]]; then
            warn "Could not determine git branch — skipping pull."
        else
            info "Pulling latest changes from origin/$BRANCH..."
            BEFORE="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
            git -C "$ROOT" pull origin "$BRANCH"
            AFTER="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
            if [[ "$BEFORE" == "$AFTER" ]]; then
                warn "Already up to date ($AFTER) — reinstalling agents anyway."
            else
                success "Updated $BEFORE → $AFTER"
            fi
        fi
    else
        warn "Not a git repo and no source folder provided."
        warn "Proceeding with sync and agent reinstall only."
    fi
fi

DESIRED_SOURCE="$(source_id)"
INSTALLED_SOURCE="$(installed_source_id)"
if ! $FORCE && [[ -n "$INSTALLED_SOURCE" && "$INSTALLED_SOURCE" == "$DESIRED_SOURCE" ]]; then
    success "Already on installed build $DESIRED_SOURCE — nothing to update."
    echo ""
    exit 0
fi

if $NO_RESTART; then
    warn "--no-restart set — syncing files without stopping agents."
else
    info "Stopping agents…"
    UID_VAL=$(id -u)
    if ! $HELPER_ONLY; then
        launchctl stop "gui/$UID_VAL/com.melolabdev.vox" 2>/dev/null || true
    fi
    if ! $AGENT_ONLY; then
        launchctl stop "gui/$UID_VAL/com.melolabdev.vox-helper" 2>/dev/null || true
    fi
    for i in {1..10}; do
        pgrep -f "uvicorn api.main:app" &>/dev/null || break
        sleep 1
    done
    if pgrep -f "uvicorn api.main:app" &>/dev/null; then
        warn "Server did not stop via launchctl; sending TERM to uvicorn."
        pkill -TERM -f "uvicorn api.main:app" 2>/dev/null || true
        sleep 2
    fi
    if pgrep -f "uvicorn api.main:app" &>/dev/null; then
        warn "Server still running; sending KILL to uvicorn."
        pkill -KILL -f "uvicorn api.main:app" 2>/dev/null || true
        sleep 1
    fi
fi

# ── Sync Python dependencies ──────────────────────────────────────────────────
if ! $HELPER_ONLY; then
    info "Syncing Python dependencies…"
    "$VENV/bin/pip" install --quiet -r "$ROOT/requirements.txt"
    success "Dependencies up to date"
fi

# ── Sync code to permanent location (never touches user data) ─────────────────
if ! $HELPER_ONLY; then
    info "Syncing server code to Application Support…"
    mkdir -p "$APP_SUPPORT/api"
    mkdir -p "$APP_SUPPORT/scripts"
    mkdir -p "$APP_SUPPORT/ui-dist"
    rsync -a --delete "$ROOT/api/"      "$APP_SUPPORT/api/"
    rsync -a --delete "$ROOT/ui-dist/"  "$APP_SUPPORT/ui-dist/"
    [[ -f "$ROOT/VERSION" ]] && ditto --norsrc "$ROOT/VERSION" "$APP_SUPPORT/VERSION"
    [[ -f "$ROOT/build_info.json" ]] && ditto --norsrc "$ROOT/build_info.json" "$APP_SUPPORT/build_info.json"
    success "Code synced"
fi

# ── Re-register agents ────────────────────────────────────────────────────────
force_app_args=()
$FORCE && force_app_args+=("--force-app")

if ! $HELPER_ONLY; then
    info "Reinstalling server LaunchAgent…"
    if $NO_RESTART; then
        bash "$ROOT/scripts/install-agent.sh" --no-reload "${force_app_args[@]}"
    else
        bash "$ROOT/scripts/install-agent.sh" "${force_app_args[@]}"
    fi
fi

if ! $AGENT_ONLY; then
    info "Reinstalling menu bar helper…"
    if $NO_RESTART; then
        bash "$ROOT/scripts/install-helper.sh" --no-reload "${force_app_args[@]}"
    else
        bash "$ROOT/scripts/install-helper.sh" "${force_app_args[@]}"
    fi
fi

write_installed_version "$DESIRED_SOURCE"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Vox updated successfully.${RESET}"
echo ""
if command -v git &>/dev/null && git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
    echo "  Branch:  $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
    echo "  Version: $DESIRED_SOURCE"
fi
echo ""
