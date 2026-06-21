#!/bin/bash
# Pull the latest changes from the current branch and restart both agents.
# Run from any directory: bash scripts/update.sh
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
VENV="$ROOT/.venv"

cd "$ROOT"

# ── Git pull ──────────────────────────────────────────────────────────────────
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

# ── Python dependencies ───────────────────────────────────────────────────────
info "Syncing Python dependencies…"
"$VENV/bin/pip" install --quiet -r "$ROOT/requirements.txt"
success "Dependencies up to date"

# ── Re-register agents ────────────────────────────────────────────────────────
info "Reinstalling server LaunchAgent…"
bash "$ROOT/scripts/install-agent.sh"

info "Reinstalling menu bar helper…"
bash "$ROOT/scripts/install-helper.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Vox updated successfully.${RESET}"
echo ""
echo "  Branch:  $BRANCH"
echo "  Version: $(git rev-parse --short HEAD)"
echo ""
