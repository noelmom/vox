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
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
BUILD_INFO="$ROOT/build_info.json"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
SIGN_IDENTITY="Developer ID Application: Noelmo Melo (S65X5KY399)"
BUILD_TMP="/tmp/vox-build-$$"
DMG_STAGING="/tmp/vox-dmg-$$"
OUTPUT_DMG="$ROOT/assets/Vox.dmg"

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ "$(uname -m)" == "arm64" ]] || fail "Vox requires Apple Silicon (M1 or later). Intel Macs are not supported."
[[ -n "$KEYCHAIN_PASSWORD" ]]  || fail "KEYCHAIN_PASSWORD is not set."
[[ -n "$APP_SIGN_PASSWORD" ]]  || fail "APP_SIGN_PASSWORD is not set."
[[ -f "$ROOT/assets/VoxHelper.icns" ]] || fail "assets/VoxHelper.icns not found."
[[ -f "$ROOT/assets/VoxServer.icns" ]] || fail "assets/VoxServer.icns not found."
[[ -f "$ROOT/assets/MenuBarRunning.png" ]] || fail "assets/MenuBarRunning.png not found."
[[ -f "$ROOT/assets/MenuBarStopped.png" ]] || fail "assets/MenuBarStopped.png not found."
[[ -f "$VENV/bin/python3" ]]   || fail "Venv not found at $VENV — run bash vox.sh install first."
command -v xcrun &>/dev/null   || fail "xcrun not found — install Xcode."
xcrun --find notarytool &>/dev/null || fail "notarytool not found — requires Xcode 13+."

"$ROOT/scripts/write-build-info.sh" "$BUILD_INFO" >/dev/null
BUILD_COMMIT="$("$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "$BUILD_INFO")"
BUILD_DATE="$("$VENV/bin/python3" -c 'import json,sys; print(json.load(open(sys.argv[1]))["built_at"])' "$BUILD_INFO")"
BUILD_NUMBER="$(date -u +"%Y%m%d%H%M")"
SPARKLE_PUBLIC_KEY="$(tr -d '[:space:]' < "$ROOT/config/sparkle-public-key.txt")"
[[ "$SPARKLE_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || fail "config/sparkle-public-key.txt must contain a Sparkle EdDSA public key."

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

cp "$ROOT/assets/VoxHelper.icns" "$HELPER_APP/Contents/Resources/VoxHelper.icns"
cp "$ROOT/assets/MenuBarRunning.png" "$HELPER_APP/Contents/Resources/MenuBarRunning.png"
cp "$ROOT/assets/MenuBarStopped.png" "$HELPER_APP/Contents/Resources/MenuBarStopped.png"
cp "$BUILD_INFO" "$HELPER_APP/Contents/Resources/build_info.json"

info "Building Swift VoxHelper with pinned Sparkle…"
swift build --package-path "$ROOT" --configuration release --arch arm64 || fail "Failed to compile VoxHelper"
HELPER_BIN="$(swift build --package-path "$ROOT" --show-bin-path --configuration release --arch arm64)/VoxHelper"
SPARKLE_FRAMEWORK="$(swift build --package-path "$ROOT" --show-bin-path --configuration release --arch arm64)/Sparkle.framework"
[[ -f "$HELPER_BIN" ]] || fail "SwiftPM did not produce VoxHelper."
[[ -d "$SPARKLE_FRAMEWORK" ]] || fail "SwiftPM did not produce Sparkle.framework."
ditto --norsrc "$HELPER_BIN" "$HELPER_APP/Contents/MacOS/VoxHelper"
mkdir -p "$HELPER_APP/Contents/Frameworks"
ditto --norsrc "$SPARKLE_FRAMEWORK" "$HELPER_APP/Contents/Frameworks/Sparkle.framework"

cat > "$HELPER_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.noelmom.vox-helper</string>
  <key>CFBundleName</key><string>Vox Helper</string>
  <key>CFBundleDisplayName</key><string>Vox Helper</string>
  <key>CFBundleExecutable</key><string>VoxHelper</string>
  <key>CFBundleIconFile</key><string>VoxHelper</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>VoxBuildCommit</key><string>$BUILD_COMMIT</string>
  <key>VoxBuiltAt</key><string>$BUILD_DATE</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>SUFeedURL</key><string>https://raw.githubusercontent.com/noelmom/vox/main/updates/appcast.xml</string>
  <key>SUPublicEDKey</key><string>$SPARKLE_PUBLIC_KEY</string>
  <key>SUEnableAutomaticChecks</key><true/>
  <key>SUAutomaticallyUpdate</key><false/>
</dict></plist>
EOF
success "VoxHelper.app built"

# ── Build VoxServer.app ───────────────────────────────────────────────────────
info "Building VoxServer.app…"
SERVER_APP="$BUILD_TMP/VoxServer.app"
mkdir -p "$SERVER_APP/Contents/MacOS" "$SERVER_APP/Contents/Resources"

cp "$ROOT/assets/VoxServer.icns" "$SERVER_APP/Contents/Resources/VoxServer.icns"
cp "$BUILD_INFO" "$SERVER_APP/Contents/Resources/build_info.json"

info "Compiling Swift VoxServer…"
swiftc \
    -target arm64-apple-macos13.0 \
    "$ROOT/voxserver/main.swift" \
    -o "$SERVER_APP/Contents/MacOS/vox-server" \
    || fail "Failed to compile vox-server launcher"

cat > "$SERVER_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.noelmom.vox-server</string>
  <key>CFBundleName</key><string>Vox</string>
  <key>CFBundleDisplayName</key><string>Vox</string>
  <key>CFBundleExecutable</key><string>vox-server</string>
  <key>CFBundleIconFile</key><string>VoxServer</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>VoxBuildCommit</key><string>$BUILD_COMMIT</string>
  <key>VoxBuiltAt</key><string>$BUILD_DATE</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
EOF
success "VoxServer.app built"

# ── Sign both apps ────────────────────────────────────────────────────────────
info "Signing Sparkle framework and VoxHelper.app…"
SPARKLE_BUNDLE="$HELPER_APP/Contents/Frameworks/Sparkle.framework"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$SPARKLE_BUNDLE/Versions/B/Autoupdate"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$SPARKLE_BUNDLE/Versions/B/XPCServices/Downloader.xpc"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$SPARKLE_BUNDLE/Versions/B/XPCServices/Installer.xpc"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$SPARKLE_BUNDLE/Versions/B/Updater.app"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$SPARKLE_BUNDLE"
codesign --force --options runtime --sign "$SIGN_IDENTITY" "$HELPER_APP"
success "VoxHelper.app signed"

info "Signing VoxServer.app…"
codesign --force --options runtime \
  --sign "$SIGN_IDENTITY" "$SERVER_APP"
success "VoxServer.app signed"

# ── Verify signatures ─────────────────────────────────────────────────────────
info "Verifying signatures…"
codesign --verify --deep --strict "$HELPER_APP"
codesign --verify --deep --strict "$SERVER_APP"
otool -L "$HELPER_APP/Contents/MacOS/VoxHelper" | grep -F "@rpath/Sparkle.framework" >/dev/null || fail "VoxHelper is not linked to Sparkle.framework"
[[ -L "$HELPER_APP/Contents/Frameworks/Sparkle.framework/Versions/Current" ]] || fail "Sparkle framework symlinks were not preserved"
success "Signatures verified"

# ── Stage DMG contents ────────────────────────────────────────────────────────
info "Staging DMG contents…"
ditto "$HELPER_APP" "$DMG_STAGING/VoxHelper.app"
ditto "$SERVER_APP" "$DMG_STAGING/VoxServer.app"

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
