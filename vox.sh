#!/bin/bash
# vox.sh — Vox installer / updater / uninstaller
#
# Usage:
#   bash vox.sh                        # interactive menu
#   bash vox.sh install                # install server + helper
#   bash vox.sh update                 # update existing install
#   bash vox.sh uninstall              # remove server + helper
#   bash vox.sh --help
#
# Flags (can be combined with any command):
#   --yes                skip all confirmation prompts
#   --token hf_xxx       set Hugging Face token during install
#   --agent-only         target server agent only
#   --helper-only        target helper only
#   --purge              on uninstall, also delete user data + venv
#   --zip /path/dir      update from extracted zip folder (not git pull)
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[vox]${RESET} $*"; }
success() { echo -e "${GREEN}[vox] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[vox] ⚠${RESET} $*"; }
fail()    { echo -e "${RED}[vox] ✗${RESET} $*"; exit 1; }
ask()     { echo -e "${CYAN}[vox]${RESET} $*"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"

# ── Defaults ──────────────────────────────────────────────────────────────────
CMD=""
OPT_YES=false
OPT_TOKEN=""
OPT_AGENT_ONLY=false
OPT_HELPER_ONLY=false
OPT_PURGE=false
OPT_ZIP=""

# ── Help ──────────────────────────────────────────────────────────────────────
show_help() {
cat <<'EOF'

  vox.sh — install, update, or uninstall Vox

  Usage:
    bash vox.sh [command] [flags]

  Commands:
    install           Install server + helper (run once on a new machine)
    update            Update an existing install (git pull or zip)
    uninstall         Remove server + helper agents

  Flags:
    --yes             Skip all confirmation prompts, use defaults
    --token hf_xxx    Set Hugging Face token during install (optional)
    --agent-only      Target server agent only
    --helper-only     Target menu bar helper only
    --purge           (uninstall) Also delete voices, outputs, data, logs, venv
    --zip /path       (update) Use extracted zip folder instead of git pull
    --help            Show this help

  Examples:
    bash vox.sh                          # interactive menu
    bash vox.sh install                  # install with prompts
    bash vox.sh install --yes            # install, no prompts, skip token
    bash vox.sh install --token hf_xxx  # install with HF token, no prompt
    bash vox.sh install --yes --token hf_xxx
    bash vox.sh update
    bash vox.sh update --zip ~/Downloads/codename-vox-main
    bash vox.sh uninstall
    bash vox.sh uninstall --purge        # remove everything including data
    bash vox.sh uninstall --yes --purge  # no confirmation

EOF
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        install|update|uninstall) CMD="$1" ;;
        --yes|-y)          OPT_YES=true ;;
        --token)           shift; OPT_TOKEN="${1:-}" ;;
        --agent-only)      OPT_AGENT_ONLY=true ;;
        --helper-only)     OPT_HELPER_ONLY=true ;;
        --purge)           OPT_PURGE=true ;;
        --zip)             shift; OPT_ZIP="${1:-}" ;;
        --help|-h)         show_help; exit 0 ;;
        *) warn "Unknown argument: $1 (run with --help to see usage)"; exit 1 ;;
    esac
    shift
done

# ── Confirm helper ────────────────────────────────────────────────────────────
confirm() {
    # confirm "message" → returns 0 (yes) or 1 (no)
    # With --yes, always returns 0
    if $OPT_YES; then return 0; fi
    ask "$1 [y/N] "
    read -r reply
    [[ "$reply" =~ ^[Yy]$ ]]
}

# ── Interactive menu (no command given) ───────────────────────────────────────
if [[ -z "$CMD" ]]; then
    echo ""
    echo -e "${BOLD}  Vox${RESET}"
    echo ""
    echo "  What would you like to do?"
    echo ""
    echo "    1) Install"
    echo "    2) Update"
    echo "    3) Uninstall"
    echo "    4) Quit"
    echo ""
    ask "Enter choice [1-4]: "
    read -r choice
    case "$choice" in
        1) CMD="install" ;;
        2) CMD="update" ;;
        3) CMD="uninstall" ;;
        4) exit 0 ;;
        *) fail "Invalid choice." ;;
    esac
    echo ""
fi

# ── INSTALL ───────────────────────────────────────────────────────────────────
do_install() {
    echo ""
    info "Starting install…"
    echo ""

    # Already installed check
    AGENT_PLIST="$HOME/Library/LaunchAgents/com.melolabdev.vox.plist"
    HELPER_PLIST="$HOME/Library/LaunchAgents/com.melolabdev.vox-helper.plist"
    if [[ -f "$AGENT_PLIST" ]] || [[ -f "$HELPER_PLIST" ]]; then
        warn "Vox appears to be already installed."
        confirm "Run update instead?" && { CMD="update"; do_update; return; }
        confirm "Reinstall anyway (will overwrite)?" || exit 0
    fi

    # Run setup.sh (creates venv, syncs code, creates .env)
    bash "$ROOT/setup.sh"

    # HF token
    if [[ -n "$OPT_TOKEN" ]]; then
        _write_token "$OPT_TOKEN"
    elif ! $OPT_YES; then
        echo ""
        ask "Hugging Face token? Speeds up model downloads (press Enter to skip): "
        read -r token
        if [[ -n "$token" ]]; then
            _write_token "$token"
        fi
    fi

    # Install agents
    if ! $OPT_HELPER_ONLY; then
        bash "$ROOT/scripts/install-agent.sh"
    fi
    if ! $OPT_AGENT_ONLY; then
        bash "$ROOT/scripts/install-helper.sh"
    fi

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Vox installed.${RESET}"
    echo ""
    echo "  Start the server from the Vox icon in your menu bar."
    echo "  Open the app at: http://localhost:8000/app"
    echo ""
}

_write_token() {
    local token="$1"
    local env_file="$APP_SUPPORT/.env"
    if grep -q "^HF_TOKEN=" "$env_file" 2>/dev/null; then
        sed -i '' "s|^HF_TOKEN=.*|HF_TOKEN=$token|" "$env_file"
    elif grep -q "^# HF_TOKEN=" "$env_file" 2>/dev/null; then
        sed -i '' "s|^# HF_TOKEN=.*|HF_TOKEN=$token|" "$env_file"
    else
        echo "HF_TOKEN=$token" >> "$env_file"
    fi
    success "HF token saved to .env"
}

# ── UPDATE ────────────────────────────────────────────────────────────────────
do_update() {
    echo ""
    info "Starting update…"
    echo ""

    if [[ ! -f "$VENV/bin/pip" ]]; then
        fail "Vox is not installed. Run: bash vox.sh install"
    fi

    if [[ -n "$OPT_ZIP" ]]; then
        bash "$ROOT/scripts/update.sh" "$OPT_ZIP"
    else
        bash "$ROOT/scripts/update.sh"
    fi
}

# ── UNINSTALL ─────────────────────────────────────────────────────────────────
do_uninstall() {
    echo ""
    warn "This will remove Vox agents from this machine."
    if $OPT_PURGE; then
        warn "  --purge: voices, outputs, data, logs, and venv will also be deleted."
    fi
    echo ""

    confirm "Continue?" || { info "Cancelled."; exit 0; }

    if ! $OPT_HELPER_ONLY; then
        bash "$ROOT/scripts/uninstall-agent.sh"
    fi
    if ! $OPT_AGENT_ONLY; then
        bash "$ROOT/scripts/uninstall-helper.sh"
    fi

    if $OPT_PURGE; then
        info "Purging user data…"
        rm -rf "$APP_SUPPORT/voices" \
               "$APP_SUPPORT/outputs" \
               "$APP_SUPPORT/data" \
               "$APP_SUPPORT/input" \
               "$APP_SUPPORT/venv" \
               "$APP_SUPPORT/api" \
               "$APP_SUPPORT/ui" \
               "$APP_SUPPORT/menubar" \
               "$APP_SUPPORT/scripts" \
               "$APP_SUPPORT/.env" \
               "$HOME/Library/Logs/Vox"
        rmdir "$APP_SUPPORT" 2>/dev/null || true
        success "All Vox data removed"
    fi

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Vox uninstalled.${RESET}"
    echo ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$CMD" in
    install)   do_install ;;
    update)    do_update ;;
    uninstall) do_uninstall ;;
esac
