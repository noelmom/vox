#!/bin/bash
# Pull the latest changes and restart both agents.
#
# Git repo:    bash scripts/update.sh
# Zip install: bash scripts/update.sh /path/to/new-vox-folder
#
# Safe to re-run — install scripts unload before reloading.
# User data (.env, voices/, outputs/, data/, input/) is never touched.
set -eo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[vox]${RESET} $*"; }
success() { echo -e "${GREEN}[vox] ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}[vox] ⚠ $*${RESET}"; }
fail()    { echo -e "${RED}[vox] ✗ $*${RESET}"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
ZIP_SRC="${1:-}"

cd "$ROOT"

# ── Verify this is an existing install ────────────────────────────────────────
if [[ ! -f "$VENV/bin/pip" ]]; then
    fail "Virtual environment not found at $VENV. Run 'bash setup.sh' first."
fi

# ── Stop agents before touching files ─────────────────────────────────────────
info "Stopping agents…"
UID_VAL=$(id -u)
launchctl kickstart -k "gui/$UID_VAL/com.melolabdev.vox"        2>/dev/null || true
launchctl stop        "gui/$UID_VAL/com.melolabdev.vox-helper"  2>/dev/null || true
# Wait for the server process to fully exit before syncing files
for i in {1..10}; do
    pgrep -f "uvicorn api.main:app" &>/dev/null || break
    sleep 1
done

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
elif git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
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

# ── Sync Python dependencies ──────────────────────────────────────────────────
info "Syncing Python dependencies…"
"$VENV/bin/pip" install --quiet -r "$ROOT/requirements.txt"
success "Dependencies up to date"

# ── Sync code to permanent location (never touches user data) ─────────────────
info "Syncing server code to Application Support…"
mkdir -p "$APP_SUPPORT/api"
mkdir -p "$APP_SUPPORT/scripts"
mkdir -p "$APP_SUPPORT/ui-dist"
rsync -a --delete "$ROOT/api/"      "$APP_SUPPORT/api/"
rsync -a --delete "$ROOT/ui-dist/"  "$APP_SUPPORT/ui-dist/"
success "Code synced"

# ── Re-register agents ────────────────────────────────────────────────────────
info "Reinstalling server LaunchAgent…"
bash "$ROOT/scripts/install-agent.sh"

info "Reinstalling menu bar helper…"
bash "$ROOT/scripts/install-helper.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Vox updated successfully.${RESET}"
echo ""
if git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
    echo "  Branch:  $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
    echo "  Version: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
fi
echo ""
