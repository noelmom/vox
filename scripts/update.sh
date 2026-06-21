#!/bin/bash
# Pull the latest changes and restart both agents.
#
# Git repo:    bash scripts/update.sh
# Zip install: bash scripts/update.sh /path/to/new-vox-folder
#
# Safe to re-run — install scripts unload before reloading.
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

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/VoxForge"
VENV="$APP_SUPPORT/venv"
ZIP_SRC="${1:-}"

cd "$ROOT"

# ── Verify this is an existing install ────────────────────────────────────────
if [[ ! -f "$VENV/bin/pip" ]]; then
    fail "Virtual environment not found at $VENV. Run 'bash setup.sh' first to set up this installation, then use update.sh for future updates."
fi

# ── Stop agents before touching files ─────────────────────────────────────────
info "Stopping agents…"
launchctl stop com.melolabdev.vox        2>/dev/null || true
launchctl stop com.melolabdev.vox-helper 2>/dev/null || true

# ── Pull or copy new source files ────────────────────────────────────────────
if [[ -n "$ZIP_SRC" ]]; then
    [[ -d "$ZIP_SRC" ]] || fail "Source folder not found: $ZIP_SRC"
    info "Copying files from $ZIP_SRC…"
    rsync -a --exclude='.env' \
             --exclude='.venv' \
             --exclude='data/' \
             --exclude='voices/' \
             --exclude='outputs/' \
             --exclude='input/' \
             "$ZIP_SRC/" "$ROOT/"
    success "Files updated from zip"
elif git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    info "Pulling latest changes from origin/$BRANCH…"
    BEFORE="$(git rev-parse --short HEAD)"
    git pull origin "$BRANCH"
    AFTER="$(git rev-parse --short HEAD)"
    if [[ "$BEFORE" == "$AFTER" ]]; then
        warn "Already up to date ($AFTER) — reinstalling agents anyway."
    else
        success "Updated $BEFORE → $AFTER"
    fi
else
    warn "Not a git repo and no source folder provided."
    warn "Usage (zip install): bash scripts/update.sh /path/to/extracted-vox"
    warn "Proceeding with dependency sync and agent reinstall only."
fi

# ── Sync Python dependencies ──────────────────────────────────────────────────
info "Syncing Python dependencies…"
"$VENV/bin/pip" install --quiet -r "$ROOT/requirements.txt"
success "Dependencies up to date"

# ── Sync helper script to permanent location ──────────────────────────────────
info "Syncing helper script to Application Support…"
mkdir -p "$APP_SUPPORT/menubar"
cp "$ROOT/menubar/vox_helper.py" "$APP_SUPPORT/menubar/vox_helper.py"
success "Helper script updated"

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
    echo "  Branch:  $(git rev-parse --abbrev-ref HEAD)"
    echo "  Version: $(git rev-parse --short HEAD)"
fi
echo ""
