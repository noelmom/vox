#!/bin/bash
# Install the VoxForge menu bar helper as a LaunchAgent.
# The helper auto-starts on login and provides a menu bar icon
# to start/stop the server, view stats, and open the web UI.
#
# Run after install-agent.sh (server agent) and setup.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PLIST_SRC="$ROOT/launchagent/com.melolabdev.vox-helper.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/VoxForge"
LABEL="com.melolabdev.vox-helper"
APP_BUNDLE="$ROOT/VoxHelper.app"

echo "[vox-helper] Installing menu bar helper…"

# 1. Ensure rumps and psutil are installed in the venv
echo "[vox-helper] Installing Python dependencies (rumps, psutil)…"
"$VENV/bin/pip" install --quiet rumps psutil

# 2. Create required directories
mkdir -p "$AGENTS_DIR"
mkdir -p "$LOG_DIR"

# 3. Build a minimal .app bundle so macOS shows "Vox Helper" and the
#    VoxForge icon in Login Items and Activity Monitor.
echo "[vox-helper] Building VoxHelper.app bundle…"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Icon — copy from project assets
cp "$ROOT/assets/VoxForge.icns" "$APP_BUNDLE/Contents/Resources/VoxForge.icns"

# Info.plist — display name, icon, bundle ID
cat > "$APP_BUNDLE/Contents/Info.plist" <<INFOPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.melolabdev.vox-helper</string>
  <key>CFBundleName</key>
  <string>Vox Helper</string>
  <key>CFBundleDisplayName</key>
  <string>Vox Helper</string>
  <key>CFBundleIconFile</key>
  <string>VoxForge</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
INFOPLIST

# Executable: symlink named 'vox-helper' so Activity Monitor shows the right name
ln -sf "$VENV/bin/python3" "$APP_BUNDLE/Contents/MacOS/vox-helper"

echo "[vox-helper] VoxHelper.app bundle built at: $APP_BUNDLE"

# 4. Write the final plist with real paths substituted
sed \
  -e "s|VOX_PROJECT_ROOT|$ROOT|g" \
  -e "s|VOX_LOG_DIR|$LOG_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DST"

echo "[vox-helper] Plist written to: $PLIST_DST"

# 5. Unload any previous version
launchctl unload "$PLIST_DST" 2>/dev/null || true

# 6. Load — RunAtLoad=true means the helper starts immediately
launchctl load "$PLIST_DST"

echo ""
echo "[vox-helper] Menu bar helper installed and started."
echo ""
echo "  The Vox icon will appear in your menu bar within a few seconds."
echo "  Logs: tail -f $LOG_DIR/vox-helper.log"
echo ""
echo "  To uninstall: bash scripts/uninstall-helper.sh"
