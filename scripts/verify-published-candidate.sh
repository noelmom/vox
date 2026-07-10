#!/bin/bash
# Verify a hosted Sparkle candidate after upload, without publishing anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_URL="${1:-}"
APPCAST_URL="${2:-}"
VERSION="${3:-}"
BUILD="${4:-}"
CHANNEL="${5:-stable}"

fail() { echo "published-candidate: $*" >&2; exit 1; }
[[ -n "$PACKAGE_URL" && -n "$APPCAST_URL" && -n "$VERSION" && -n "$BUILD" ]] \
  || fail "usage: $0 PACKAGE_URL APPCAST_URL VERSION BUILD [stable|beta]"
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "beta" ]] || fail "channel must be stable or beta"
[[ "$PACKAGE_URL" == https://* && "$APPCAST_URL" == https://* ]] \
  || fail "package and appcast URLs must use HTTPS"
[[ "$PACKAGE_URL" == *"/Vox-${VERSION}.pkg" ]] \
  || fail "package URL must end with /Vox-${VERSION}.pkg"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vox-published-candidate.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
PACKAGE="$TMP_DIR/Vox-${VERSION}.pkg"
APPCAST="$TMP_DIR/appcast.xml"

download() {
  local url="$1"
  local output="$2"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 120 --output "$output" "$url"
}

download "$PACKAGE_URL" "$PACKAGE"
download "$APPCAST_URL" "$APPCAST"

python3 "$ROOT/scripts/appcast.py" verify \
  --appcast "$APPCAST" --package "$PACKAGE" --channel "$CHANNEL" \
  --build "$BUILD" --package-url "$PACKAGE_URL" --verify-signature

bash "$ROOT/scripts/verify-package-candidate.sh" "$PACKAGE"
echo "published-candidate: hosted package and appcast passed verification"
