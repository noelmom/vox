#!/bin/bash
# Unified Vox release helper.
#
# Usage:
#   bash scripts/release.sh 0.5.4-beta
#
# This script updates VERSION/changelog shell metadata, builds signed/notarized
# DMG + pkg artifacts, updates the public-site package checksum, commits,
# tags, pushes, and uploads the pkg to GitHub Releases.
set -eo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[release]${RESET} $*"; }
success() { echo -e "${GREEN}[release] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[release] ⚠${RESET} $*"; }
fail()    { echo -e "${RED}[release] ✗${RESET} $*"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
RELEASE_REPO="${RELEASE_REPO:-noelmom/vox}"
[[ -n "$VERSION" ]] || fail "Version required, e.g. bash scripts/release.sh 0.5.4-beta"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || fail "Invalid version: $VERSION"

cd "$ROOT"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree is dirty. Commit or stash changes first."
[[ -n "$APP_SIGN_PASSWORD" ]] || fail "APP_SIGN_PASSWORD is not set."
[[ -n "$KEYCHAIN_PASSWORD" ]] || fail "KEYCHAIN_PASSWORD is not set."
command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is required."

TAG="v$VERSION"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  fail "Tag already exists: $TAG"
fi

info "Updating VERSION to $VERSION"
printf "%s\n" "$VERSION" > VERSION

if ! grep -q "## \\[$VERSION\\]" CHANGELOG.md; then
  info "Adding changelog placeholder"
  python3 - "$VERSION" <<'PY'
from pathlib import Path
from datetime import date
import sys
version = sys.argv[1]
path = Path("CHANGELOG.md")
text = path.read_text()
marker = "---\n\n"
section = f"## [{version}] — {date.today().isoformat()}\n\n### Changed\n- Release notes TBD.\n\n"
if marker in text:
    text = text.replace(marker, marker + section, 1)
else:
    text += "\n\n" + section
path.write_text(text)
PY
fi

info "Stamping build info"
scripts/write-build-info.sh >/dev/null

info "Preparing UI build"
npm --prefix ui-src run build

info "Committing version prep"
git add VERSION build_info.json CHANGELOG.md ui-dist
git commit -m "chore: prepare $VERSION release"

info "Building signed/notarized DMG"
bash scripts/build-apps.sh

info "Building signed/notarized pkg"
bash scripts/build-pkg.sh

PKG="assets/Vox-$VERSION.pkg"
DMG="assets/Vox.dmg"
[[ -f "$PKG" ]] || fail "Package missing: $PKG"
[[ -f "$DMG" ]] || fail "DMG missing: $DMG"
HASH="$(shasum -a 256 "$PKG" | awk '{print $1}')"
SHORT_HASH="${HASH:0:4}…${HASH: -4}"
SIZE_BYTES="$(stat -f '%z' "$PKG")"
SIZE_MB="$(python3 - "$SIZE_BYTES" <<'PY'
import sys
size = int(sys.argv[1]) / (1024 * 1024)
print(f"{size:.1f} MB")
PY
)"

info "Updating landing package metadata"
python3 - "$VERSION" "$SIZE_MB" "$HASH" "$SHORT_HASH" <<'PY'
from pathlib import Path
import re, sys
version, size, sha, short = sys.argv[1:5]
path = Path("public-site/index.html")
text = path.read_text()
text = re.sub(r'Vox-[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?\.pkg', f'Vox-{version}.pkg', text)
text = re.sub(r'v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?/Vox-', f'v{version}/Vox-', text)
text = re.sub(r'"softwareVersion": "[^"]+"', f'"softwareVersion": "{version}"', text)
text = re.sub(r'<span class="version-pill">v[^<]+</span>', f'<span class="version-pill">v{version}</span>', text)
text = re.sub(r'[0-9]+(?:\.[0-9]+)? MB · signed, notarized, stapled', f'{size} · signed, notarized, stapled', text)
text = re.sub(r'[a-f0-9]{64}', sha, text)
text = re.sub(r'SHA256 [a-f0-9]{4}…[a-f0-9]{4}', f'SHA256 {short}', text)
path.write_text(text)
PY

npm --prefix ui-src run build

info "Committing release metadata"
git add build_info.json public-site/index.html ui-dist assets/Vox.dmg
git commit -m "docs: update $VERSION package metadata"

info "Pushing branch and tag"
git push origin "$(git branch --show-current)"
git tag -a "$TAG" -m "Vox ${VERSION} Beta"
git push origin "$TAG"

info "Creating GitHub prerelease"
gh release create "$TAG" "$PKG" "$DMG" \
  --repo "$RELEASE_REPO" \
  --title "Vox ${VERSION} Beta" \
  --prerelease \
  --notes "## Vox ${VERSION} Beta

### Installer
- File: Vox-${VERSION}.pkg
- SHA256: ${HASH}
- Size: ${SIZE_MB}
- Signed, notarized, stapled, and accepted by Gatekeeper.

### DMG
- File: Vox.dmg
- Signed, notarized, stapled, and accepted by Gatekeeper."

success "Released $TAG"
