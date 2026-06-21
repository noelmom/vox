#!/bin/bash
# Remove the Vox server LaunchAgent.
# Kills the running server if active, then removes the agent and VoxServer.app.
set -euo pipefail

LABEL="com.melolabdev.vox"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
SERVER_BUNDLE="$APP_SUPPORT/VoxServer.app"

if [[ ! -f "$PLIST_DST" ]]; then
    echo "[vox] Server LaunchAgent not installed — nothing to do."
    exit 0
fi

echo "[vox] Uninstalling server LaunchAgent…"

# Kill the running process if active, then unload the agent
UID_VAL=$(id -u)
launchctl kill SIGTERM "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

# Remove VoxServer.app from Application Support
if [[ -d "$SERVER_BUNDLE" ]]; then
    rm -rf "$SERVER_BUNDLE"
    echo "[vox] Removed $SERVER_BUNDLE"
fi

echo ""
echo "[vox] Server uninstalled."
echo ""
echo "  The following are kept and must be removed manually if needed:"
echo "    Data:  $APP_SUPPORT/{voices,outputs,data,input}"
echo "    Logs:  $HOME/Library/Logs/Vox/"
echo "    Code:  $APP_SUPPORT/{api,ui,scripts}"
echo ""
echo "  Run scripts/install-agent.sh to reinstall."
