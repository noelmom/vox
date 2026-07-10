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

Both LaunchAgents should include `AssociatedBundleIdentifiers` pointing at their signed app bundles (`com.noelmom.vox-server` and `com.noelmom.vox-helper`). macOS uses this hint in System Settings → General → Login Items & Extensions → Background Activity; without it, Vox can appear under the signer name with a generic icon.

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

Complete local CI (preferred before every push):

```bash
bash scripts/ci-local.sh
bash scripts/ci-local.sh --clean  # release-sized handoffs / cache-independence check
```

Results, individual logs, and a machine-readable summary are written below `.ci/results/`. The clean mode removes only project-local CI caches and dependencies; it does not touch installed Vox data.

Backend tests and lint:

```bash
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m pip install -r requirements-dev.txt
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m pytest
"$HOME/Library/Application Support/Vox/venv/bin/python3" -m ruff check api tests
"$HOME/Library/Application Support/Vox/venv/bin/codespell" --skip './.git,./assets,./data,./input,./outputs,./ui-dist,./ui-src/bun.lock,./ui-src/package-lock.json,./ui-src/node_modules,./voices,./working-poc' .
```

GitHub Actions and `scripts/ci-local.sh` install the fully resolved `requirements-ci-lock.txt` so CI does not download Torch/Chatterbox model dependencies or drift between clean runs. When either source requirements file changes, regenerate and review the lock deliberately.

Frontend checks:

```bash
npm ci --prefix ui-src
npm run lint --prefix ui-src
npm run typecheck --prefix ui-src
npm run test --prefix ui-src
npm run build --prefix ui-src
npm run test:e2e --prefix ui-src
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

Prepare local, non-publishing appcast evidence from a staged package:

```bash
bash scripts/prepare-release-candidate.sh 0.5.4 2026071001 2026070001 \
  /staging/Vox-0.5.4.pkg https://updates.example.com/vox/releases/Vox-0.5.4.pkg \
  /staging/0.5.4.md stable 2026-07-10T14:00:00Z
```

The guarded release script finalizes only an already built and verified candidate:

1. Requires immutable candidate provenance for the current source commit.
2. Re-probes the hosted package and live appcast against that provenance.
3. Only then pushes the source branch, tags it, and creates the GitHub release when a maintainer explicitly supplies both `--publish` and `VOX_RELEASE_PUBLISH=1`.

Build/sign/notarize/staple the DMG and package separately, prepare candidate evidence, upload and probe the package, then publish/probe the appcast before calling this finalizer. This ordering prevents a tag or release from being created before the live update path is valid.

Publishing requires separate explicit authorization and uses:

```bash
VOX_RELEASE_PUBLISH=1 \
VOX_RELEASE_EVIDENCE=.release-candidates/1.0.0-rc9-2026071001 \
VOX_RELEASE_APPCAST_URL=https://updates.example.com/vox/appcast.xml \
bash scripts/release.sh 1.0.0-rc9 --publish
```

`scripts/release.sh` intentionally sets `RELEASE_REPO="${RELEASE_REPO:-noelmom/vox}"` and passes `--repo "$RELEASE_REPO"` to `gh release create`. Keep that explicit. After the project moved from `MeloLabDev/codename-vox` to `noelmom/vox`, relying on GitHub CLI repo inference caused intermittent `401 Unauthorized` failures during release creation even though `gh auth status` was valid. If testing a fork, override it explicitly:

```bash
RELEASE_REPO=owner/repo VOX_RELEASE_PUBLISH=1 \
VOX_RELEASE_EVIDENCE=.release-candidates/1.0.0-rc9-2026071001 \
VOX_RELEASE_APPCAST_URL=https://updates.example.com/vox/appcast.xml \
bash scripts/release.sh 1.0.0-rc9 --publish
```

GitHub Releases should publish `Vox-<version>.pkg` only. `assets/Vox.dmg` is still built, signed, notarized, stapled, committed, and used by `vox.sh install` / manual local install flows, but do not upload it to public releases because it only contains the two app bundles and can confuse testers who need the one-click installer.

The script re-runs `gh auth status` immediately before creating the GitHub release. This catches cases where the signing/notarization flow sat at a keychain prompt long enough for the final release upload to hit a stale/invalid GitHub CLI auth path.

Build/sign/notarize scripts require:

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

- `scripts/build-apps.sh` calls `scripts/notarize.sh`, which verifies the DMG locally but never commits, pushes, tags, uploads, or changes an appcast.
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

- Signed Vox Helper builds use pinned Sparkle 2 for normal native update checks. `scripts/update.sh` remains a recovery/source-update path and must not replace the normal Sparkle action.
- The Sparkle EdDSA public key is committed at `config/sparkle-public-key.txt`; its private counterpart is held in the release operator's Keychain and must never be committed or passed on a command line.
- Package scripts detect an installed marker. Fresh installs may perform prerequisite/bootstrap work and open Welcome; updates skip first-install network checks, record a transaction under `/Library/Logs/Vox/`, preserve user data, validate server health, and never open Welcome.
- `vox.sh install` runs setup and installs LaunchAgents/helper.
- `vox.sh update` delegates to `scripts/update.sh`.
- Updates compare desired source build to `~/Library/Application Support/Vox/installed_version.json`.
- If already current, update exits cleanly without dependency sync or agent restarts.
- Use `--force` to bypass the skip.
- `scripts/update.sh` also supports `--no-restart`, `--agent-only`, and `--helper-only`.
- Helper menu `Check for Updates...` uses native Sparkle UI. Keep the Terminal/source updater available only as an explicit Recovery / source update path for repair and development installs.

## Backend Model Readiness

- FastAPI starts before Chatterbox finishes loading.
- `GET /api/v1/status` reports model state: `not_loaded`, `loading`, `ready`, or `error`.
- Vox Helper displays model readiness in the menu.
- `POST /api/v1/tts` returns `503` while the model is not ready.
- Only `api/core/generation_worker.py` may import Torch/Chatterbox or own MPS. A replacement worker must never start until the previous process is confirmed dead and reaped.
- Final WAV/MP3 encoding also runs in a supervised subprocess; do not move blocking encoding back to an unkillable executor thread.
- Generation cancellation remains `cancelling` until worker exit; a worker that survives terminate/kill is quarantined and requires a Vox restart.
- Final audio crosses `outputs/.publishing-*` markers. Startup must reconcile markers and job-scoped `.partial/` data before interrupting other nonterminal jobs.

## Network Trust And Pairing

- Loopback requests remain token-free, but every request still passes Host validation and unsafe browser methods pass Origin/Fetch Metadata checks.
- LAN mode is opt-in (`VOX_HOST=0.0.0.0`). Unauthenticated remote clients may access only minimal `GET /health` and the pairing flow.
- Vox Helper creates single-use five-minute pairing codes through the loopback-only trusted path. Never put pairing codes, bearer tokens, or cookies in logs or URLs.
- Remote sessions and API tokens are stored only as SHA-256 hashes in `data/security/credentials.db`; its directory and file must remain owner-only.
- Scope boundaries live centrally in `api/middleware/security.py`: read for metadata, generate for synthesis/private audio, and admin for settings, logs, backups, mutation, deletion, and credential management.
- Disabling LAN mode revokes all remote credentials immediately. Do not weaken this behavior to preserve a remote session.
- The LAN browser cookie cannot be `Secure` on Vox's default HTTP transport. Keep it `HttpOnly` and `SameSite=Strict`, show the trusted-LAN warning, and use `Secure` only when a future trusted-TLS mode can enforce HTTPS end to end.

## Managed Data Safety

- Voice slugs are lowercase ASCII letters/numbers separated by single hyphens, at most 64 characters. Always use `canonical_voice_slug`; never construct a voice filename from raw user input.
- Resolve runtime paths through `managed_path` or `stored_managed_path` before reading, replacing, or deleting. Restored database values are untrusted even though the database is local.
- Voice and inline prompt uploads must use `stream_upload` and `VOX_MAX_VOICE_UPLOAD_MB`; never call `await UploadFile.read()` without a bound.
- Voice icons must remain bounded PNG data URLs and pass decoded byte, signature, and dimension validation.
- Restore archives accept only the manifest, Vox database, and voice tree. Preserve entry/count/expanded-size/compression-ratio, duplicate, traversal, symlink, manifest, schema, integrity, and managed-path checks.
- Database and voice restore is one rollback transaction. Keep the prior database and voice tree until the restored database reconnects successfully; never touch `.env`, outputs, input, or unrelated preferences/files.

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
