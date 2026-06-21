#!/bin/bash
# Notarize and staple VoxHelper.app for distribution outside the Mac App Store.
# Run once before each public release, after install-helper.sh has signed the bundle.
#
# Requirements:
#   - Xcode (full app) for notarytool and stapler
#   - Certificate: Developer ID Application: Noelmo Melo (S65X5KY399)
#   - Apple ID: noelmormelo@gmail.com
#   - App-specific password: generate at appleid.apple.com → Security → App-Specific Passwords
#   - Team ID: S65X5KY399
#
# Usage:
#   bash scripts/notarize-helper.sh
#   (prompts for app-specific password — never stored in files or git)
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[notarize]${RESET} $*"; }
success() { echo -e "${GREEN}[notarize] ✓ $*${RESET}"; }
fail()    { echo -e "${RED}[notarize] ✗ $*${RESET}"; exit 1; }

APP_BUNDLE="$HOME/Applications/VoxHelper.app"
APPLE_ID="noelmormelo@gmail.com"
TEAM_ID="S65X5KY399"
SIGN_IDENTITY="Developer ID Application: Noelmo Melo (S65X5KY399)"
ZIP_PATH="/tmp/VoxHelper-notarize.zip"

# ── Preflight checks ──────────────────────────────────────────────────────────
[[ -d "$APP_BUNDLE" ]] || fail "VoxHelper.app not found at $APP_BUNDLE. Run install-helper.sh first."

command -v xcrun &>/dev/null || fail "xcrun not found. Install Xcode (full app) from the App Store."
xcrun --find notarytool &>/dev/null || fail "notarytool not found. Requires Xcode 13 or later."

# Verify the bundle is already signed
codesign --verify --deep --strict "$APP_BUNDLE" 2>/dev/null \
    || fail "Bundle is not signed. Run install-helper.sh first to sign with Developer ID."

info "Bundle verified: $APP_BUNDLE"

# ── App-specific password ─────────────────────────────────────────────────────
echo ""
echo "  Enter your app-specific password for $APPLE_ID"
echo "  Generate one at: appleid.apple.com → Security → App-Specific Passwords"
echo ""
read -s -p "  App-specific password: " APP_PASSWORD
echo ""

# ── Zip for submission ────────────────────────────────────────────────────────
info "Creating zip for notarization…"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$APP_BUNDLE" "$ZIP_PATH"
success "Zip created at $ZIP_PATH"

# ── Submit to Apple notary service ────────────────────────────────────────────
info "Submitting to Apple notary service (this takes a few minutes)…"
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APP_PASSWORD" \
    --wait
success "Notarization approved"

# ── Staple the ticket to the bundle ──────────────────────────────────────────
info "Stapling notarization ticket to bundle…"
xcrun stapler staple "$APP_BUNDLE"
success "Stapled — VoxHelper.app is ready for distribution"

# ── Verify final result ───────────────────────────────────────────────────────
info "Verifying…"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
spctl --assess --type execute --verbose "$APP_BUNDLE"

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -f "$ZIP_PATH"

echo ""
echo -e "${GREEN}${BOLD}VoxHelper.app is notarized and ready for distribution.${RESET}"
echo ""
echo "  Re-run install-helper.sh on test devices to pick up the notarized bundle."
echo ""
