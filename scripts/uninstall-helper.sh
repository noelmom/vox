#!/bin/bash
# Remove the Vox menu bar helper LaunchAgent and app bundle.
# The icon disappears from the menu bar immediately.
set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.melolabdev.vox-helper.plist"
APP_BUNDLE="/Applications/VoxHelper.app"
APP_SUPPORT="$HOME/Library/Application Support/Vox"

if [[ ! -f "$PLIST_DST" ]]; then
  echo "[vox-helper] Helper not installed — nothing to do."
  exit 0
fi

echo "[vox-helper] Uninstalling menu bar helper…"

launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

# Remove app bundle from /Applications
if [[ -d "$APP_BUNDLE" ]]; then
  rm -rf "$APP_BUNDLE"
  echo "[vox-helper] Removed $APP_BUNDLE"
fi

# Remove helper script from permanent location
if [[ -f "$APP_SUPPORT/menubar/vox_helper.py" ]]; then
  rm -f "$APP_SUPPORT/menubar/vox_helper.py"
  echo "[vox-helper] Removed helper script from Application Support"
fi

echo ""
echo "[vox-helper] Done. Log files kept at: $HOME/Library/Logs/Vox/"
echo "             Venv kept at: $APP_SUPPORT/venv"
echo "             Run scripts/install-helper.sh to reinstall."
