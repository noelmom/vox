#!/bin/bash
# Remove the VoxForge menu bar helper LaunchAgent.
# The icon disappears from the menu bar immediately.
set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.melolabdev.vox-helper.plist"
LABEL="com.melolabdev.vox-helper"

if [[ ! -f "$PLIST_DST" ]]; then
  echo "[vox-helper] Helper not installed — nothing to do."
  exit 0
fi

echo "[vox-helper] Uninstalling menu bar helper…"
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
echo "[vox-helper] Done. Log files kept at: \$HOME/Library/Logs/VoxForge/"
echo "             Run scripts/install-helper.sh to reinstall."
