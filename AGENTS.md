# AGENTS.md

Guidance for AI agents and maintainers working on Vox.

This repository ships a local Apple Silicon text-to-speech app with a FastAPI backend, React UI, native Swift helper, LaunchAgents, signed DMG builds, and signed/notarized PKG releases. Treat changes as product work, not only code edits.

## Scope

- Work only in the Vox repository for this project. The local checkout may still be named `codename-vox` until the GitHub repo rename lands.
- Respect the v1.0 scope freeze: before v1.0, only bug fixes, product polish, documentation accuracy, release hardening, and true blockers should be added. New feature ideas belong in `BACKLOG.md` as post-v1 items unless the user explicitly reclassifies them.
- Preserve user/runtime data. Never delete `voices/`, `outputs/`, `data/`, `input/`, `.env`, or anything under `~/Library/Application Support/Vox/` unless the user explicitly asks for a purge.
- The source tree is not the runtime install. Installed runtime files live in `~/Library/Application Support/Vox/`; app bundles live in `/Applications/Vox/`.
- `.pkg` artifacts are release assets, not repo files. Do not commit `assets/*.pkg`.
- Do not reintroduce `VOX_MPS_MEMORY_FRACTION` or `torch.mps.set_per_process_memory_fraction` without an explicit test plan and user approval. Testing on June 28, 2026 showed that adding this allocator cap caused repeatable MPS out-of-memory regressions on scripts that were stable with normal PyTorch MPS defaults.

## Architecture Quick Map

- Backend/API: `api/`
- React app source: `ui-src/`
- Production UI served by FastAPI: `ui-dist/`
- Native helper: `voxhelper/`
- Native server launcher: `voxserver/`
- LaunchAgent templates: `launchagent/`
- Installer/update/build scripts: `vox.sh`, `setup.sh`, `scripts/`
- Release/build identity: `VERSION`, `build_info.json`, `scripts/write-build-info.sh`
- Public landing page package metadata: `public-site/index.html`
- Local installed welcome page: `ui-src/src/routes/index.tsx`
- Backlog/release notes: `BACKLOG.md`, `CHANGELOG.md`

## Runtime Layout

Runtime install path:

```text
~/Library/Application Support/Vox/
├── api/
├── ui-dist/
├── scripts/
├── voices/
├── outputs/
├── data/
├── input/
├── .env
├── VERSION
├── build_info.json
└── installed_version.json
```

Native app bundles:

```text
/Applications/Vox/VoxHelper.app
/Applications/Vox/VoxServer.app
```

LaunchAgents:

```text
~/Library/LaunchAgents/com.noelmom.vox.plist
~/Library/LaunchAgents/com.noelmom.vox-helper.plist
```

Logs:

```text
~/Library/Logs/Vox/vox.log
~/Library/Logs/Vox/vox-error.log
~/Library/Logs/Vox/vox-helper.log
~/Library/Logs/Vox/vox-helper-error.log
~/Library/Logs/Vox/install.log
```

## Build Identity

Vox intentionally tracks Studio/server and Helper/native builds separately.

- `VERSION` is the release version.
- `build_info.json` contains `version`, `commit`, and `built_at`.
- `/app` footer shows the Studio/server build from `GET /api/v1/settings`.
- Vox Helper menu shows both installed Studio build and bundled Helper build.
- `installed_version.json` records the source build installed into Application Support and is used to skip redundant updates.

This split matters because web/server changes can ship without rebuilding native app bundles.

## Common Development Commands

Backend tests and lint:

```bash
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m pip install -r requirements-dev.txt
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m pytest
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m ruff check api tests
"$HOME/Library/Application Support/Vox/venv/bin/codespell" --skip './.git,./assets,./data,./input,./outputs,./ui-dist,./ui-src/bun.lock,./ui-src/node_modules,./voices,./working-poc' .
```

GitHub Actions installs `requirements-ci.txt` plus `requirements-dev.txt` for backend checks so CI does not download Torch/Chatterbox model dependencies just to run unit tests.

Frontend checks:

```bash
npm run typecheck --prefix ui-src
npm run build --prefix ui-src
```

Shell syntax:

```bash
bash -n vox.sh setup.sh scripts/*.sh pkg-scripts/*
```

Swift helper compile:

```bash
swiftc -target arm64-apple-macos13.0 \
  -framework AppKit -framework Foundation -framework IOKit \
  voxhelper/main.swift \
  voxhelper/AppDelegate.swift \
  voxhelper/StatusBarController.swift \
  voxhelper/ServerMonitor.swift \
  -o /tmp/VoxHelper-test
```

Manual server run for debugging:

```bash
launchctl stop gui/$(id -u)/com.noelmom.vox
bash scripts/run.sh
```

## Release Procedure

Preferred release command:

```bash
bash scripts/release.sh 0.5.4-beta
```

The release script:

1. Updates `VERSION`.
2. Stamps `build_info.json`.
3. Builds `ui-dist`.
4. Commits release prep.
5. Builds/signs/notarizes/staples `assets/Vox.dmg`.
6. Builds/signs/notarizes/staples `assets/Vox-<version>.pkg`.
7. Computes package size and SHA256.
8. Updates public landing package metadata in `public-site/index.html`.
9. Rebuilds `ui-dist`.
10. Commits final release metadata.
11. Pushes branch and tag.
12. Creates the GitHub prerelease on `noelmom/vox` and uploads only the PKG.

`scripts/release.sh` intentionally sets `RELEASE_REPO="${RELEASE_REPO:-noelmom/vox}"` and passes `--repo "$RELEASE_REPO"` to `gh release create`. Keep that explicit. After the project moved from `MeloLabDev/codename-vox` to `noelmom/vox`, relying on GitHub CLI repo inference caused intermittent `401 Unauthorized` failures during release creation even though `gh auth status` was valid. If testing a fork, override it explicitly:

```bash
RELEASE_REPO=owner/repo bash scripts/release.sh 1.0.0-rc9
```

GitHub Releases should publish `Vox-<version>.pkg` only. `assets/Vox.dmg` is still built, signed, notarized, stapled, committed, and used by `vox.sh install` / manual local install flows, but do not upload it to public releases because it only contains the two app bundles and can confuse testers who need the one-click installer.

Required environment:

```bash
KEYCHAIN_PASSWORD=...
APP_SIGN_PASSWORD=...
```

Required tools/certs:

- Developer ID Application certificate
- Developer ID Installer certificate
- `xcrun notarytool`
- GitHub CLI `gh`

Important:

- `scripts/build-apps.sh` calls `scripts/notarize.sh`, which commits and pushes `assets/Vox.dmg`.
- `.pkg` files are ignored and should be uploaded to GitHub Releases, not committed.
- After building a `.pkg`, landing page checksum/size must match that exact file.

## Signing And Notarization Caveat

Codesign checks in sandboxed or unusual agent environments can be misleading and have produced false positives/false negatives before. Prefer the real build scripts and real macOS verification:

```bash
pkgutil --check-signature assets/Vox-<version>.pkg
spctl --assess --type install --verbose assets/Vox-<version>.pkg
spctl --assess --type open --context context:primary-signature --verbose assets/Vox.dmg
```

Do not spend time chasing sandbox-only codesign behavior unless the real build/install path also fails.

## Update/Install Behavior

- `vox.sh install` runs setup and installs LaunchAgents/helper.
- `vox.sh update` delegates to `scripts/update.sh`.
- Updates compare desired source build to `~/Library/Application Support/Vox/installed_version.json`.
- If already current, update exits cleanly without dependency sync or agent restarts.
- Use `--force` to bypass the skip.
- `scripts/update.sh` also supports `--no-restart`, `--agent-only`, and `--helper-only`.
- Helper menu `Check for Updates...` opens the update flow in Terminal so output and prompts are visible.

## Backend Model Readiness

- FastAPI starts before Chatterbox finishes loading.
- `GET /api/v1/status` reports model state: `not_loaded`, `loading`, `ready`, or `error`.
- Vox Helper displays model readiness in the menu.
- `POST /api/v1/tts` returns `503` while the model is not ready.

## UI Build Rules

- Edit React source under `ui-src/src`.
- Always rebuild `ui-dist` with `npm run build --prefix ui-src` when frontend behavior changes.
- Commit both source and generated `ui-dist` when shipping UI changes.
- Use the existing visual language: compact controls, restrained cards, no decorative gradient blobs/orbs, no nested cards.
- For Create page changes, check intermediate widths. The Voice Studio panel should stay top-first on one-column layouts and move right only at the active two-column breakpoint.

## Helper Rules

- Helper is native Swift in `voxhelper/`.
- Prefer AppKit menu items and simple Terminal handoffs for long-running install/update/uninstall flows.
- Helper support URL is `https://noelmom.github.io`.
- Helper status icon is monochrome template `VOX`; do not reintroduce colored status dots.
- Login toggles edit LaunchAgent `RunAtLoad` and reload the plist.

## Documentation Rules

When behavior changes, update the relevant docs in the same commit:

- `README.md` for user-facing or architecture changes.
- `scripts/README.md` for install/update/release script behavior.
- `BACKLOG.md` when an item is completed, changed, blocked, or superseded.
- `CHANGELOG.md` when preparing a release.
- `AGENTS.md` when a new invariant, trap, or repeatable procedure is discovered.

## Git Rules

- Do not revert user changes unless explicitly asked.
- Keep commits focused and descriptive.
- Before pushing, run relevant verification for the files touched.
- Before tagging, ensure `git status --short` is clean.
