#!/bin/bash
# Install the Vox menu bar helper as a LaunchAgent.
# The helper auto-starts on login and provides a menu bar icon
# to start/stop the server, view stats, and open the web UI.
#
# Run after install-agent.sh and setup.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
PLIST_SRC="$ROOT/launchagent/com.melolabdev.vox-helper.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.melolabdev.vox-helper"
APP_BUNDLE="/Applications/VoxHelper.app"
SIGN_IDENTITY="Developer ID Application: Noelmo Melo (S65X5KY399)"
PREBUILT_ZIP="$ROOT/assets/VoxHelper.app.zip"

echo "[vox-helper] Installing menu bar helper…"

# 1. Verify venv exists (setup.sh must have run first)
if [[ ! -f "$VENV/bin/python" ]]; then
    echo "[vox-helper] ✗ Virtual environment not found at $VENV"
    echo "             Run 'bash setup.sh' first."
    exit 1
fi

# 2. Install Python dependencies into the permanent venv
echo "[vox-helper] Installing Python dependencies (rumps, psutil)…"
"$VENV/bin/pip" install --quiet rumps psutil pyobjc-framework-Cocoa

# 3. Create required directories
mkdir -p "$AGENTS_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$APP_SUPPORT/menubar"

# 4. Copy helper script to permanent location
echo "[vox-helper] Copying helper script to $APP_SUPPORT/menubar/…"
cp "$ROOT/menubar/vox_helper.py" "$APP_SUPPORT/menubar/vox_helper.py"

# 5. Build or install VoxHelper.app
if [[ -f "$PREBUILT_ZIP" ]]; then
    # Use pre-signed bundle from assets/
    echo "[vox-helper] Installing pre-signed VoxHelper.app from assets/…"
    echo "[vox-helper] sudo required to install into /Applications — you may be prompted for your password."
    sudo rm -rf "$APP_BUNDLE"
    sudo ditto -x -k "$PREBUILT_ZIP" /Applications/
    sudo xattr -rd com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true
    echo "[vox-helper] ✓ VoxHelper.app installed from pre-signed zip"
else
    # Compile Swift launcher at install time (dev machine only)
    echo "[vox-helper] No pre-signed zip found — compiling VoxHelper.app with swiftc…"
    mkdir -p "$APP_BUNDLE/Contents/MacOS"
    mkdir -p "$APP_BUNDLE/Contents/Resources"

    cp "$ROOT/assets/Vox.icns" "$APP_BUNDLE/Contents/Resources/Vox.icns"

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
  <string>Vox</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
INFOPLIST

    LAUNCHER_SRC="$(mktemp /tmp/vox-launcher-XXXXXX.swift)"
    cat > "$LAUNCHER_SRC" <<SWIFT
import Foundation

let home = FileManager.default.homeDirectoryForCurrentUser.path
let python = "\(home)/Library/Application Support/Vox/venv/bin/python3"
let script = "\(home)/Library/Application Support/Vox/menubar/vox_helper.py"

let args = CommandLine.arguments.dropFirst()
var fullArgs = [script] + args

let process = Process()
process.executableURL = URL(fileURLWithPath: python)
process.arguments = fullArgs
try? process.run()
process.waitUntilExit()
SWIFT

    echo "[vox-helper] Compiling launcher binary…"
    swiftc -O -o "$APP_BUNDLE/Contents/MacOS/vox-helper" "$LAUNCHER_SRC"
    rm -f "$LAUNCHER_SRC"

    if security find-identity -v -p codesigning 2>/dev/null | grep -qF "$SIGN_IDENTITY"; then
        echo "[vox-helper] Signing VoxHelper.app…"
        codesign --deep --force --options runtime \
            --sign "$SIGN_IDENTITY" \
            "$APP_BUNDLE"
        echo "[vox-helper] ✓ Signed with $SIGN_IDENTITY"
    else
        echo "[vox-helper] ⚠ Signing identity not found — skipping codesign"
        echo "             Install the Developer ID Application certificate and re-run."
    fi

    echo "[vox-helper] VoxHelper.app built at: $APP_BUNDLE"
fi

# 7. Write the final plist with real paths substituted
sed \
  -e "s|VOX_APP_SUPPORT|$APP_SUPPORT|g" \
  -e "s|VOX_LOG_DIR|$LOG_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DST"

echo "[vox-helper] Plist written to: $PLIST_DST"

# 8. Unload any previous version
launchctl unload "$PLIST_DST" 2>/dev/null || true

# 9. Load — RunAtLoad=true means the helper starts immediately
launchctl load "$PLIST_DST"

echo ""
echo "[vox-helper] Menu bar helper installed and started."
echo ""
echo "  The Vox icon will appear in your menu bar within a few seconds."
echo "  Helper script: $APP_SUPPORT/menubar/vox_helper.py"
echo "  App bundle:    $APP_BUNDLE"
echo "  Logs:          tail -f $LOG_DIR/vox-helper.log"
echo ""
echo "  For public distribution, notarize the bundle:"
echo "  bash scripts/notarize-helper.sh"
echo ""
echo "  To uninstall: bash scripts/uninstall-helper.sh"
