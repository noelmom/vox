#!/bin/bash
# Remove the Vox server LaunchAgent.
# Kills the running server if active, then removes the agent and VoxServer.app.
set -eo pipefail

LABEL="com.melolabdev.vox"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
APP_DIR="/Applications/Vox"

run_admin() {
    if [[ "$EUID" -eq 0 ]]; then
        "$@"
    elif [[ -t 0 ]]; then
        sudo "$@"
    else
        sudo -n "$@" 2>/dev/null || {
            echo "[vox] x Admin permission required to remove $APP_DIR. Run this command in Terminal so macOS can ask for your password."
            exit 1
        }
    fi
}

if [[ ! -f "$PLIST_DST" ]]; then
    echo "[vox] Server LaunchAgent not installed — nothing to do."
    exit 0
fi

echo "[vox] Uninstalling server LaunchAgent…"

# Stop the running process (suppresses KeepAlive restart), then unload
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

# Remove VoxServer.app from /Applications/Vox
if [[ -d "$APP_DIR/VoxServer.app" ]]; then
    run_admin rm -rf "$APP_DIR/VoxServer.app"
    echo "[vox] Removed VoxServer.app from $APP_DIR"
fi

run_admin rmdir "$APP_DIR" 2>/dev/null || true

echo ""
echo "[vox] Server uninstalled."
echo ""
echo "  The following are kept and must be removed manually if needed:"
echo "    Data:  $APP_SUPPORT/{voices,outputs,data,input}"
echo "    Logs:  $HOME/Library/Logs/Vox/"
echo "    Code:  $APP_SUPPORT/{api,ui-dist,scripts}"
echo ""
echo "  Run scripts/install-agent.sh to reinstall."
