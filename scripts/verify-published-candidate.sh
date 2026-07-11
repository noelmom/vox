#!/bin/bash
# Verify a hosted Sparkle candidate after upload, without publishing anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EVIDENCE="${1:-}"
APPCAST_URL="${2:-}"

fail() { echo "published-candidate: $*" >&2; exit 1; }
[[ -n "$EVIDENCE" ]] \
  || fail "usage: $0 /path/to/candidate-evidence [https://updates.example.com/vox/appcast.xml]"
[[ -d "$EVIDENCE" && -f "$EVIDENCE/provenance.txt" ]] \
  || fail "candidate provenance not found: $EVIDENCE/provenance.txt"
provenance_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }' "$EVIDENCE/provenance.txt"
}
VERSION="$(provenance_value version)"
BUILD="$(provenance_value build)"
CHANNEL="$(provenance_value channel)"
PACKAGE_URL="$(provenance_value package_url)"
EXPECTED_SHA256="$(provenance_value package_sha256)"
EXPECTED_SIGNATURE="$(provenance_value appcast_signature)"
EXPECTED_LENGTH="$(provenance_value appcast_length)"
[[ -n "$VERSION" && -n "$BUILD" && -n "$CHANNEL" && -n "$PACKAGE_URL" && -n "$EXPECTED_SHA256" && -n "$EXPECTED_SIGNATURE" && "$EXPECTED_LENGTH" =~ ^[0-9]+$ ]] \
  || fail "candidate provenance is incomplete"
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "beta" ]] || fail "channel must be stable or beta"
[[ "$PACKAGE_URL" == https://* ]] || fail "package URL must use HTTPS"
[[ -z "$APPCAST_URL" || "$APPCAST_URL" == https://* ]] \
  || fail "appcast URL must use HTTPS"
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
ACTUAL_SHA256="$(shasum -a 256 "$PACKAGE" | awk '{print $1}')"
[[ "$ACTUAL_SHA256" == "$EXPECTED_SHA256" ]] \
  || fail "hosted package SHA-256 does not match candidate provenance"

bash "$ROOT/scripts/verify-package-candidate.sh" "$PACKAGE"
PHASE="package"
if [[ -n "$APPCAST_URL" ]]; then
  download "$APPCAST_URL" "$APPCAST"
  python3 "$ROOT/scripts/appcast.py" verify \
    --appcast "$APPCAST" --package "$PACKAGE" --channel "$CHANNEL" \
    --build "$BUILD" --package-url "$PACKAGE_URL" --expected-signature "$EXPECTED_SIGNATURE" \
    --expected-length "$EXPECTED_LENGTH" --verify-signature
  PHASE="appcast"
fi
PROBE="$(mktemp "$EVIDENCE/hosted-probe.XXXXXX")"
printf '{"state":"passed","phase":"%s","verified_at":"%s","appcast_url":"%s","package_url":"%s","package_sha256":"%s"}\n' \
  "$PHASE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$APPCAST_URL" "$PACKAGE_URL" "$ACTUAL_SHA256" > "$PROBE"
echo "published-candidate: hosted $PHASE passed verification; evidence: $PROBE"
