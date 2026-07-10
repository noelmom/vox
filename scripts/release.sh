#!/bin/bash
# Finalize an already verified Vox release. This script never builds, signs,
# uploads, or mutates an appcast; those stages must be completed first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
PUBLISH="${2:-}"
RELEASE_REPO="${RELEASE_REPO:-noelmom/vox}"
EVIDENCE="${VOX_RELEASE_EVIDENCE:-}"
APPCAST_URL="${VOX_RELEASE_APPCAST_URL:-}"

fail() { echo "[release] ERROR: $*" >&2; exit 1; }
info() { echo "[release] $*"; }
provenance_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }' "$EVIDENCE/provenance.txt"
}

[[ -n "$VERSION" && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] \
  || fail "usage: VOX_RELEASE_PUBLISH=1 VOX_RELEASE_EVIDENCE=/path VOX_RELEASE_APPCAST_URL=https://... $0 VERSION --publish"
[[ "$PUBLISH" == "--publish" && "${VOX_RELEASE_PUBLISH:-}" == "1" ]] \
  || fail "finalization publishes a tag and GitHub release; require --publish and VOX_RELEASE_PUBLISH=1"
[[ -n "$EVIDENCE" && -n "$APPCAST_URL" && -d "$EVIDENCE" && -f "$EVIDENCE/provenance.txt" ]] \
  || fail "VOX_RELEASE_EVIDENCE with provenance.txt and VOX_RELEASE_APPCAST_URL are required"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail "working tree is dirty"

cd "$ROOT"
[[ "$(git branch --show-current)" == "redesign" ]] \
  || fail "release finalization is restricted to the redesign branch until explicit merge approval"
[[ "$(provenance_value version)" == "$VERSION" ]] || fail "candidate version does not match requested release"
[[ "$(provenance_value source_commit)" == "$(git rev-parse HEAD)" ]] \
  || fail "candidate was not built from the current commit"
PACKAGE="$EVIDENCE/Vox-${VERSION}.pkg"
[[ -f "$PACKAGE" ]] || fail "candidate package is missing: $PACKAGE"
[[ -f "$EVIDENCE/evidence.sha256" ]] || fail "candidate integrity manifest is missing"
(cd "$EVIDENCE" && shasum -a 256 -c evidence.sha256 >/dev/null) \
  || fail "candidate evidence no longer matches its integrity manifest"
package_probe_found=false
for probe in "$EVIDENCE"/hosted-probe.*; do
  [[ -f "$probe" ]] || continue
  if rg -Fq '"phase":"package"' "$probe" && \
     rg -Fq "\"package_url\":\"$(provenance_value package_url)\"" "$probe" && \
     rg -Fq "\"package_sha256\":\"$(provenance_value package_sha256)\"" "$probe"; then
    package_probe_found=true
    break
  fi
done
$package_probe_found || fail "a matching hosted package-only probe is required before appcast finalization"

# This is intentionally before every tag, push, or GitHub mutation. It proves
# the hosted package matches the candidate provenance and that the appcast was
# published only after the package probe passed.
info "Verifying hosted package and final appcast"
bash "$ROOT/scripts/verify-published-candidate.sh" "$EVIDENCE" "$APPCAST_URL"

TAG="v$VERSION"
git rev-parse "$TAG" >/dev/null 2>&1 && fail "tag already exists: $TAG"
command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is required"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI auth is not valid"

info "Pushing verified source branch"
git push origin "$(git branch --show-current)"
git tag -a "$TAG" -m "Vox $VERSION"
git push origin "$TAG"

RELEASE_FLAGS=()
[[ "$VERSION" == *-* ]] && RELEASE_FLAGS+=(--prerelease)
SHA256="$(shasum -a 256 "$PACKAGE" | awk '{print $1}')"
SIZE_BYTES="$(stat -f '%z' "$PACKAGE")"
SIZE_MB="$(python3 - "$SIZE_BYTES" <<'PY'
import sys
print(f"{int(sys.argv[1]) / (1024 * 1024):.1f} MB")
PY
)"
info "Creating verified GitHub release"
gh release create "$TAG" "$PACKAGE" --repo "$RELEASE_REPO" --verify-tag \
  --title "Vox $VERSION" "${RELEASE_FLAGS[@]}" \
  --notes "## Vox $VERSION

### Installer
- File: Vox-${VERSION}.pkg
- SHA256: ${SHA256}
- Size: ${SIZE_MB}
- Signed, notarized, stapled, and verified against the live Sparkle appcast."

echo "[release] Released $TAG"
