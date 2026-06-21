#!/bin/bash
# Build and zip both .app bundles for distribution.
# Run on your dev machine before committing to git.
#
# Builds entirely in a temp directory — never touches /Applications
# or ~/Library/Application Support/Vox so existing installs are safe.
#
# Output:
#   assets/VoxHelper.app.zip   — placed in /Applications by install-helper.sh
#   assets/VoxServer.app.zip   — placed in ~/Library/Application Support/Vox/ by install-agent.sh
#
# NOTE: Signing is skipped until the Developer ID cert issue is resolved.
# See BACKLOG.md — "Fix Developer ID codesign (errSecInternalComponent)".
# Test devices: right-click → Open on first launch to bypass Gatekeeper.
#
# Requirements: Xcode Command Line Tools (swiftc)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$(mktemp -d /tmp/vox-build-XXXXXX)"

BOLD="\033[1m"
GREEN="\033[0;32m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[build]${RESET} $*"; }
success() { echo -e "${GREEN}[build] ✓ $*${RESET}"; }

cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

if ! command -v swiftc &>/dev/null; then
    echo "[build] ✗ swiftc not found. Install Xcode Command Line Tools:"
    echo "         xcode-select --install"
    exit 1
fi

mkdir -p "$ROOT/assets"
info "Build directory: $BUILD_DIR"

# ── VoxHelper.app ─────────────────────────────────────────────────────────────
info "Building VoxHelper.app…"

HELPER="$BUILD_DIR/VoxHelper.app"
mkdir -p "$HELPER/Contents/MacOS" "$HELPER/Contents/Resources"

cp "$ROOT/assets/Vox.icns" "$HELPER/Contents/Resources/Vox.icns"

cat > "$HELPER/Contents/Info.plist" <<'INFOPLIST'
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

cat > "$BUILD_DIR/helper.swift" <<'SWIFT'
import Foundation
let home = FileManager.default.homeDirectoryForCurrentUser.path
let python = "\(home)/Library/Application Support/Vox/venv/bin/python3"
let script = "\(home)/Library/Application Support/Vox/menubar/vox_helper.py"
let process = Process()
process.executableURL = URL(fileURLWithPath: python)
process.arguments = [script] + CommandLine.arguments.dropFirst()
try? process.run()
process.waitUntilExit()
SWIFT

swiftc -O -o "$HELPER/Contents/MacOS/vox-helper" "$BUILD_DIR/helper.swift"

rm -f "$ROOT/assets/VoxHelper.app.zip"
ditto -c -k --keepParent "$HELPER" "$ROOT/assets/VoxHelper.app.zip"
success "assets/VoxHelper.app.zip ready"

# ── VoxServer.app ─────────────────────────────────────────────────────────────
info "Building VoxServer.app…"

SERVER="$BUILD_DIR/VoxServer.app"
mkdir -p "$SERVER/Contents/MacOS"

cat > "$SERVER/Contents/Info.plist" <<'INFOPLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.melolabdev.vox-server</string>
  <key>CFBundleName</key>
  <string>Vox Server</string>
  <key>CFBundleDisplayName</key>
  <string>Vox Server</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSBackgroundOnly</key>
  <true/>
</dict>
</plist>
INFOPLIST

cat > "$BUILD_DIR/server.swift" <<'SWIFT'
import Foundation
let home = FileManager.default.homeDirectoryForCurrentUser.path
let script = "\(home)/Library/Application Support/Vox/scripts/run.sh"
let process = Process()
process.executableURL = URL(fileURLWithPath: "/bin/bash")
process.arguments = [script]
try? process.run()
process.waitUntilExit()
SWIFT

swiftc -O -o "$SERVER/Contents/MacOS/vox-server" "$BUILD_DIR/server.swift"

rm -f "$ROOT/assets/VoxServer.app.zip"
ditto -c -k --keepParent "$SERVER" "$ROOT/assets/VoxServer.app.zip"
success "assets/VoxServer.app.zip ready"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Both apps built successfully.${RESET}"
echo ""
echo "  assets/VoxHelper.app.zip   → installed to /Applications/ by install-helper.sh"
echo "  assets/VoxServer.app.zip   → installed to ~/Library/Application Support/Vox/ by install-agent.sh"
echo ""
echo "  Commit to git:"
echo "  git add assets/VoxHelper.app.zip assets/VoxServer.app.zip"
echo "  git commit -m 'chore: update app bundles'"
echo ""
echo "  ⚠ Bundles are unsigned. Test devices must right-click → Open on first launch."
echo "  Signing will be enabled once the Developer ID cert issue is resolved."
echo ""
