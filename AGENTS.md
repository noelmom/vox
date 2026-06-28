# AGENTS.md

Guidance for AI agents and maintainers working on Codename Vox.

This repository ships a local Apple Silicon text-to-speech app with a FastAPI backend, React UI, native Swift helper, LaunchAgents, signed DMG builds, and signed/notarized PKG releases. Treat changes as product work, not only code edits.

## Scope

- Work only in `codename-vox` for this project.
- Preserve user/runtime data. Never delete `voices/`, `outputs/`, `data/`, `input/`, `.env`, or anything under `~/Library/Application Support/Vox/` unless the user explicitly asks for a purge.
- The source tree is not the runtime install. Installed runtime files live in `~/Library/Application Support/Vox/`; app bundles live in `/Applications/Vox/`.
- `.pkg` artifacts are release assets, not repo files. Do not commit `assets/*.pkg`.

## Architecture Quick Map

- Backend/API: `api/`
- React app source: `ui-src/`
- Production UI served by FastAPI: `ui-dist/`
- Native helper: `voxhelper/`
- Native server launcher: `voxserver/`
- LaunchAgent templates: `launchagent/`
- Installer/update/build scripts: `vox.sh`, `setup.sh`, `scripts/`
- Release/build identity: `VERSION`, `build_info.json`, `scripts/write-build-info.sh`
- Public landing page package metadata: `ui-src/src/routes/index.tsx`
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
~/Library/LaunchAgents/com.melolabdev.vox.plist
~/Library/LaunchAgents/com.melolabdev.vox-helper.plist
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
```

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
launchctl stop gui/$(id -u)/com.melolabdev.vox
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
8. Updates landing package metadata in `ui-src/src/routes/index.tsx`.
9. Rebuilds `ui-dist`.
10. Commits final release metadata.
11. Pushes branch and tag.
12. Creates a GitHub prerelease and uploads the `.pkg`.

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
