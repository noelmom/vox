#!/bin/bash
# Build, sign, package, and notarize VoxHelper.app + VoxServer.app into a single DMG.
#
# Requires:
#   KEYCHAIN_PASSWORD  — login keychain password (for codesign access)
#   APP_SIGN_PASSWORD  — Apple app-specific password (for notarytool)
#
# Output: assets/Vox.dmg (signed + notarized + stapled)
#
# Usage:
#   bash scripts/build-apps.sh
set -eo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[build]${RESET} $*"; }
success() { echo -e "${GREEN}[build] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[build] ⚠${RESET} $*"; }
fail()    { echo -e "${RED}[build] ✗${RESET} $*"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
SIGN_IDENTITY="Developer ID Application: Noelmo Melo (S65X5KY399)"
APPLE_ID="noelmormelo@gmail.com"
TEAM_ID="S65X5KY399"
BUILD_TMP="/tmp/vox-build-$$"
DMG_STAGING="/tmp/vox-dmg-$$"
OUTPUT_DMG="$ROOT/assets/Vox.dmg"

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ -n "$KEYCHAIN_PASSWORD" ]]  || fail "KEYCHAIN_PASSWORD is not set."
[[ -n "$APP_SIGN_PASSWORD" ]]  || fail "APP_SIGN_PASSWORD is not set."
[[ -f "$ROOT/assets/Vox.icns" ]] || fail "assets/Vox.icns not found."
[[ -f "$VENV/bin/python3" ]]   || fail "Venv not found at $VENV — run bash vox.sh install first."
command -v xcrun &>/dev/null   || fail "xcrun not found — install Xcode."
xcrun --find notarytool &>/dev/null || fail "notarytool not found — requires Xcode 13+."

mkdir -p "$BUILD_TMP" "$DMG_STAGING"

cleanup() { rm -rf "$BUILD_TMP" "$DMG_STAGING"; }
trap cleanup EXIT

# ── Unlock keychain ───────────────────────────────────────────────────────────
info "Unlocking keychain…"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db
success "Keychain unlocked"

# ── Build VoxHelper.app ───────────────────────────────────────────────────────
info "Building VoxHelper.app…"
HELPER_APP="$BUILD_TMP/VoxHelper.app"
mkdir -p "$HELPER_APP/Contents/MacOS" "$HELPER_APP/Contents/Resources"

cp "$ROOT/assets/Vox.icns" "$HELPER_APP/Contents/Resources/Vox.icns"

cat > "$HELPER_APP/Contents/MacOS/vox-helper" <<EOF
#!/bin/bash
VENV="\$HOME/Library/Application Support/Vox/venv"
SCRIPT="\$HOME/Library/Application Support/Vox/menubar/vox_helper.py"
exec "\$VENV/bin/python3" "\$SCRIPT" "\$@"
EOF
chmod +x "$HELPER_APP/Contents/MacOS/vox-helper"

cat > "$HELPER_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.melolabdev.vox-helper</string>
  <key>CFBundleName</key><string>Vox Helper</string>
  <key>CFBundleDisplayName</key><string>Vox Helper</string>
  <key>CFBundleExecutable</key><string>vox-helper</string>
  <key>CFBundleIconFile</key><string>Vox</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.3.1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
EOF
success "VoxHelper.app built"

# ── Build VoxServer.app ───────────────────────────────────────────────────────
info "Building VoxServer.app…"
SERVER_APP="$BUILD_TMP/VoxServer.app"
mkdir -p "$SERVER_APP/Contents/MacOS" "$SERVER_APP/Contents/Resources"

cp "$ROOT/assets/Vox.icns" "$SERVER_APP/Contents/Resources/Vox.icns"

cat > "$SERVER_APP/Contents/MacOS/vox-server" <<EOF
#!/bin/bash
APP_SUPPORT="\$HOME/Library/Application Support/Vox"
exec "\$APP_SUPPORT/scripts/run.sh"
EOF
chmod +x "$SERVER_APP/Contents/MacOS/vox-server"

cat > "$SERVER_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.melolabdev.vox-server</string>
  <key>CFBundleName</key><string>Vox</string>
  <key>CFBundleDisplayName</key><string>Vox</string>
  <key>CFBundleExecutable</key><string>vox-server</string>
  <key>CFBundleIconFile</key><string>Vox</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.3.1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
EOF
success "VoxServer.app built"

# ── Sign both apps ────────────────────────────────────────────────────────────
info "Signing VoxHelper.app…"
codesign --deep --force --options runtime \
  --sign "$SIGN_IDENTITY" "$HELPER_APP"
success "VoxHelper.app signed"

info "Signing VoxServer.app…"
codesign --deep --force --options runtime \
  --sign "$SIGN_IDENTITY" "$SERVER_APP"
success "VoxServer.app signed"

# ── Verify signatures ─────────────────────────────────────────────────────────
info "Verifying signatures…"
codesign --verify --deep --strict "$HELPER_APP"
codesign --verify --deep --strict "$SERVER_APP"
success "Signatures verified"

# ── Stage DMG contents ────────────────────────────────────────────────────────
info "Staging DMG contents…"
cp -r "$HELPER_APP" "$DMG_STAGING/VoxHelper.app"
cp -r "$SERVER_APP" "$DMG_STAGING/VoxServer.app"

# ── Create and sign DMG ───────────────────────────────────────────────────────
info "Creating Vox.dmg…"
rm -f "$OUTPUT_DMG"
hdiutil create \
  -volname "Vox" \
  -srcfolder "$DMG_STAGING" \
  -ov \
  -format UDZO \
  "$OUTPUT_DMG"

info "Signing Vox.dmg…"
codesign --force --sign "$SIGN_IDENTITY" "$OUTPUT_DMG"
success "Vox.dmg created and signed: $OUTPUT_DMG"

# ── Lock keychain ─────────────────────────────────────────────────────────────
security lock-keychain ~/Library/Keychains/login.keychain-db
success "Keychain locked"

# ── Notarize ──────────────────────────────────────────────────────────────────
echo ""
info "Handing off to notarize.sh…"
echo ""
bash "$ROOT/scripts/notarize.sh"
