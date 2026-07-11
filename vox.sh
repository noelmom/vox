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
#   --pkg-mode           internal: package postinstall mode
#   --force              force update/reinstall even when installed version matches
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
require_git() {
    if command -v git &>/dev/null && xcode-select -p &>/dev/null; then
        return 0
    fi

    fail "Git/Xcode Command Line Tools are required for this action. Run: xcode-select --install"
}

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
OPT_BRANCH=""
OPT_PKG_MODE=false
OPT_FORCE=false

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
    --devbranch       Switch to the development branch before running command
    --branch NAME     Switch to a specific branch before running command
    --pkg-mode        Internal: used by the signed macOS package postinstall
    --force           Force update/reinstall even when installed version matches
    --help            Show this help

  Examples:
    bash vox.sh                              # interactive menu
    bash vox.sh install                      # install with prompts
    bash vox.sh install --yes                # install, no prompts, skip token
    bash vox.sh install --token hf_xxx      # install with HF token, no prompt
    bash vox.sh install --yes --token hf_xxx
    bash vox.sh install --devbranch          # install from development branch
    bash vox.sh update                       # pull current branch
    bash vox.sh update --devbranch           # switch to development and pull
    bash vox.sh update --branch main         # switch back to main and pull
    bash vox.sh update --zip ~/Downloads/vox-main
    bash vox.sh uninstall
    bash vox.sh uninstall --devbranch        # uninstall using development scripts
    bash vox.sh uninstall --purge            # remove everything including data
    bash vox.sh uninstall --yes --purge      # no confirmation

EOF
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        install|update|uninstall) CMD="$1" ;;
        --yes|-y)          OPT_YES=true ;;
        --token)           shift; [[ -n "${1:-}" ]] || fail "--token requires a value"; OPT_TOKEN="${1:-}" ;;
        --agent-only)      OPT_AGENT_ONLY=true ;;
        --helper-only)     OPT_HELPER_ONLY=true ;;
        --purge)           OPT_PURGE=true ;;
        --zip)             shift; [[ -n "${1:-}" ]] || fail "--zip requires a path"; OPT_ZIP="${1:-}" ;;
        --branch)          shift; [[ -n "${1:-}" ]] || fail "--branch requires a name"; OPT_BRANCH="${1:-}" ;;
        --devbranch)       OPT_BRANCH="development" ;;
        --pkg-mode)        OPT_PKG_MODE=true; OPT_YES=true ;;
        --force)           OPT_FORCE=true ;;
        --help|-h)         show_help; exit 0 ;;
        *) warn "Unknown argument: $1 (run with --help to see usage)"; exit 1 ;;
    esac
    shift
done

# ── Architecture check ────────────────────────────────────────────────────────
[[ "$(uname -m)" == "arm64" ]] || { echo -e "${RED}[vox] ✗ Vox requires Apple Silicon (M1 or later). Intel Macs are not supported.${RESET}"; exit 1; }

# ── Confirm helper ────────────────────────────────────────────────────────────
confirm() {
    # confirm "message" → returns 0 (yes) or 1 (no)
    # With --yes, always returns 0
    if $OPT_YES; then return 0; fi
    ask "$1 [y/N] "
    read -r reply
    [[ "$reply" =~ ^[Yy]$ ]]
}

# ── Branch switch (applies to all commands) ───────────────────────────────────
if [[ -n "$OPT_BRANCH" ]]; then
    require_git
    if git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
        info "Switching to branch: $OPT_BRANCH..."
        git -C "$ROOT" fetch origin
        git -C "$ROOT" checkout "$OPT_BRANCH" || fail "Branch '$OPT_BRANCH' not found."
        success "Now on branch: $OPT_BRANCH"
        echo ""
    else
        warn "--branch / --devbranch has no effect — not a git repository."
    fi
fi

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
    AGENT_PLIST="$HOME/Library/LaunchAgents/com.noelmom.vox.plist"
    HELPER_PLIST="$HOME/Library/LaunchAgents/com.noelmom.vox-helper.plist"
    if ! $OPT_PKG_MODE && { [[ -f "$AGENT_PLIST" ]] || [[ -f "$HELPER_PLIST" ]]; }; then
        warn "Vox appears to be already installed."
        confirm "Run update instead?" && { CMD="update"; do_update; return; }
        confirm "Reinstall anyway (will overwrite)?" || exit 0
    fi

    # Run setup.sh (creates venv, syncs code, creates .env)
    if $OPT_PKG_MODE; then
        VOX_PKG_MODE=1 bash "$ROOT/setup.sh"
    else
        bash "$ROOT/setup.sh"
    fi

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
        if $OPT_PKG_MODE; then
            bash "$ROOT/scripts/install-agent.sh" --pkg-mode
        elif $OPT_FORCE; then
            bash "$ROOT/scripts/install-agent.sh" --force-app
        else
            bash "$ROOT/scripts/install-agent.sh"
        fi
    fi
    if ! $OPT_AGENT_ONLY; then
        if $OPT_PKG_MODE; then
            bash "$ROOT/scripts/install-helper.sh" --pkg-mode
        elif $OPT_FORCE; then
            bash "$ROOT/scripts/install-helper.sh" --force-app
        else
            bash "$ROOT/scripts/install-helper.sh"
        fi
    fi

    _write_installed_version
    _verify_install

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Vox installed.${RESET}"
    echo ""
    echo "  First run may continue downloading/loading the Chatterbox model in the background."
    echo "  If the app is not ready immediately, wait a few minutes and check:"
    echo "    V-wave menu bar icon → Files → View Logs"
    echo ""
    echo "  The V-wave is bright when Vox is ready and dims while stopped or restarting."
    echo "  Open its menu to start Vox, restart it, or open Vox Studio."
    echo "  Open the app at: http://localhost:8000/app"
    echo ""
}

_verify_install() {
    local app_dir="/Applications/Vox"
    local agent_plist="$HOME/Library/LaunchAgents/com.noelmom.vox.plist"
    local helper_plist="$HOME/Library/LaunchAgents/com.noelmom.vox-helper.plist"

    if ! $OPT_HELPER_ONLY; then
        [[ -x "$app_dir/VoxServer.app/Contents/MacOS/vox-server" ]] \
            || fail "VoxServer.app was not installed correctly at $app_dir/VoxServer.app"
        [[ -f "$agent_plist" ]] \
            || fail "Server LaunchAgent was not installed at $agent_plist"
    fi

    if ! $OPT_AGENT_ONLY; then
        [[ -x "$app_dir/VoxHelper.app/Contents/MacOS/VoxHelper" ]] \
            || fail "VoxHelper.app was not installed correctly at $app_dir/VoxHelper.app"
        [[ -f "$helper_plist" ]] \
            || fail "Helper LaunchAgent was not installed at $helper_plist"
    fi
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

_source_id() {
    if [[ -d "$ROOT/.git" ]] || [[ -f "$ROOT/.git" ]]; then
        git -C "$ROOT" rev-parse --short HEAD 2>/dev/null && return 0
    fi
    if [[ -f "$ROOT/build_info.json" && -f "$VENV/bin/python3" ]]; then
        "$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit","unknown"))' "$ROOT/build_info.json" 2>/dev/null && return 0
    fi
    echo "unknown"
}

_write_installed_version() {
    local source_commit
    source_commit="$(_source_id)"
    local version="unknown"
    [[ -f "$ROOT/VERSION" ]] && version="$(tr -d '[:space:]' < "$ROOT/VERSION")"
    [[ -f "$VENV/bin/python3" ]] || return 0
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

# ── UPDATE ────────────────────────────────────────────────────────────────────
do_update() {
    echo ""
    info "Starting update…"
    echo ""

    if [[ ! -f "$VENV/bin/pip" ]]; then
        fail "Vox is not installed. Run: bash vox.sh install"
    fi

    update_args=()
    [[ -n "$OPT_ZIP" ]] && update_args+=("$OPT_ZIP")
    $OPT_FORCE && update_args+=("--force")
    $OPT_PKG_MODE && update_args+=("--pkg-mode")
    $OPT_AGENT_ONLY && update_args+=("--agent-only")
    $OPT_HELPER_ONLY && update_args+=("--helper-only")
    if [[ ${#update_args[@]} -gt 0 ]]; then
        bash "$ROOT/scripts/update.sh" "${update_args[@]}"
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

    uninstall_args=(--yes)
    if $OPT_AGENT_ONLY; then
        uninstall_args+=(--agent)
    elif $OPT_HELPER_ONLY; then
        uninstall_args+=(--helper)
    else
        uninstall_args+=(--all)
    fi
    $OPT_PURGE && uninstall_args+=(--data)

    bash "$ROOT/scripts/uninstall.sh" "${uninstall_args[@]}"

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
