#!/bin/bash
# Read-only inspection for a signed Vox installer candidate. Never installs it.
set -euo pipefail

PACKAGE="${1:-}"
fail() { echo "package-verify: $*" >&2; exit 1; }
[[ -n "$PACKAGE" && -f "$PACKAGE" ]] || fail "usage: $0 /path/to/Vox-x.y.z.pkg"
command -v pkgutil >/dev/null 2>&1 || fail "pkgutil is required on macOS"

payload="$(pkgutil --payload-files "$PACKAGE" | sed 's#^\./##')"
EXPANDED="$(mktemp -d "${TMPDIR:-/tmp}/vox-package-verify.XXXXXX")"
rmdir "$EXPANDED"
trap 'rm -rf "$EXPANDED"' EXIT
pkgutil --expand-full "$PACKAGE" "$EXPANDED"
require_path() {
  grep -Fxq "$1" <<<"$payload" || fail "missing payload path: $1"
}
reject_path() {
  if grep -Fq "$1" <<<"$payload"; then
    fail "protected runtime data must not be packaged: $1"
  fi
}

require_path "Applications/Vox/VoxHelper.app/Contents/Info.plist"
require_path "Applications/Vox/VoxServer.app/Contents/Info.plist"
require_path "Library/Application Support/Vox/Bootstrap/vox.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/update.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/prepare-release-candidate.sh"
reject_path "Library/Application Support/Vox/voices/"
reject_path "Library/Application Support/Vox/outputs/"
reject_path "Library/Application Support/Vox/data/"
reject_path "Library/Application Support/Vox/input/"
reject_path "Library/Application Support/Vox/.env"

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  if [[ "$(basename "$path")" == ._* && ! -e "$EXPANDED/Payload/$path" ]]; then
    # Newer macOS versions expose provenance xattrs as virtual AppleDouble
    # records in pkgutil output. They are not payload files after expansion.
    continue
  fi
  case "$path" in
    .|Applications|Applications/Vox|Library|"Library/Application Support"|\
    "Library/Application Support/Vox"|"Library/Application Support/Vox/Bootstrap"|\
    "Library/Application Support/Vox/Bootstrap/api"|\
    "Library/Application Support/Vox/Bootstrap/ui-dist"|\
    "Library/Application Support/Vox/Bootstrap/scripts"|\
    "Library/Application Support/Vox/Bootstrap/voices") ;;
    Applications/Vox/VoxHelper.app|Applications/Vox/VoxServer.app|\
    Applications/Vox/VoxHelper.app/*|Applications/Vox/VoxServer.app/*) ;;
    "Library/Application Support/Vox/Bootstrap/vox.sh"|\
    "Library/Application Support/Vox/Bootstrap/setup.sh"|\
    "Library/Application Support/Vox/Bootstrap/requirements.txt"|\
    "Library/Application Support/Vox/Bootstrap/VERSION"|\
    "Library/Application Support/Vox/Bootstrap/build_info.json"|\
    "Library/Application Support/Vox/Bootstrap/api/"*|\
    "Library/Application Support/Vox/Bootstrap/ui-dist/"*|\
    "Library/Application Support/Vox/Bootstrap/scripts/"*|\
    "Library/Application Support/Vox/Bootstrap/voices/noelmo-demo.wav") ;;
    *) fail "unexpected package payload path: $path" ;;
  esac
  case "$path" in
    */.env|*/.env.*|*/.git/*|*/.DS_Store|*/__pycache__/*|*.pyc|*.pyo|\
    */node_modules/*|*/.pytest_cache/*|*/.mypy_cache/*|*/.ci/*|\
    */working-poc/*|*.pem|*.key|*.p12|*.mobileprovision|*.sqlite)
      fail "development, cache, or secret material must not be packaged: $path" ;;
  esac
done <<<"$payload"

FRAMEWORK="$EXPANDED/Payload/Applications/Vox/VoxHelper.app/Contents/Frameworks/Sparkle.framework"
HELPER="$EXPANDED/Payload/Applications/Vox/VoxHelper.app/Contents/MacOS/VoxHelper"
[[ -L "$FRAMEWORK/Versions/Current" ]] || fail "Sparkle framework Current symlink is missing"
CURRENT_FRAMEWORK_VERSION="$(readlink "$FRAMEWORK/Versions/Current")"
[[ "$CURRENT_FRAMEWORK_VERSION" =~ ^[A-Za-z0-9._-]+$ && -d "$FRAMEWORK/Versions/$CURRENT_FRAMEWORK_VERSION" ]] \
  || fail "Sparkle framework Current symlink has an invalid target"
[[ -f "$FRAMEWORK/Versions/Current/Sparkle" ]] || fail "Sparkle framework executable is missing"
[[ -f "$HELPER" ]] || fail "VoxHelper executable is missing from package payload"
otool -L "$HELPER" | grep -Fq "@rpath/Sparkle.framework" \
  || fail "VoxHelper is not linked against Sparkle through @rpath"

pkgutil --check-signature "$PACKAGE"
if command -v spctl >/dev/null 2>&1; then
  spctl --assess --type install --verbose "$PACKAGE"
fi
xcrun stapler validate "$PACKAGE"

echo "package-verify: payload, signature, stapling, and protected-data boundaries passed"
