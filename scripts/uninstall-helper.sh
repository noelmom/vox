#!/bin/bash
# Remove the Vox menu bar helper LaunchAgent and app bundle.
# Kills the running helper if active, then removes the agent and VoxHelper.app.
set -eo pipefail

LABEL="com.noelmom.vox-helper"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LEGACY_LABEL="com.melolabdev.vox-helper"
LEGACY_PLIST="$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
APP_DIR="/Applications/Vox"

run_admin() {
    if [[ "$EUID" -eq 0 ]]; then
        "$@"
    elif [[ -t 0 ]]; then
        sudo "$@"
    else
        sudo -n "$@" 2>/dev/null || {
            echo "[vox-helper] x Admin permission required to remove $APP_DIR. Run this command in Terminal so macOS can ask for your password."
            exit 1
        }
    fi
}

if [[ ! -f "$PLIST_DST" && ! -f "$LEGACY_PLIST" ]]; then
    echo "[vox-helper] Helper not installed — nothing to do."
    exit 0
fi

echo "[vox-helper] Uninstalling menu bar helper…"

# Stop and unload the LaunchAgent (suppresses KeepAlive restart)
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
launchctl stop "gui/$UID_VAL/$LEGACY_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
rm -f "$PLIST_DST"
rm -f "$LEGACY_PLIST"

# Kill any remaining VoxHelper process and wait for it to exit
if pgrep -x "VoxHelper" &>/dev/null; then
    pkill -x "VoxHelper" 2>/dev/null || true
    for i in {1..10}; do
        pgrep -x "VoxHelper" &>/dev/null || break
        sleep 0.3
    done
fi

# Remove VoxHelper.app from /Applications/Vox
if [[ -d "$APP_DIR/VoxHelper.app" ]]; then
    run_admin rm -rf "$APP_DIR/VoxHelper.app"
    echo "[vox-helper] Removed VoxHelper.app from $APP_DIR"
fi

run_admin rmdir "$APP_DIR" 2>/dev/null || true

echo ""
echo "[vox-helper] Helper uninstalled."
echo ""
echo "  Log files kept at: $HOME/Library/Logs/Vox/"
echo "  Venv kept at:      $APP_SUPPORT/venv"
echo ""
echo "  Run scripts/install-helper.sh to reinstall."
