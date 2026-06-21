# Backlog

Ideas and improvements to revisit. Not bugs — these are enhancements queued for later.

---

## Quality & Testing Strategy

- [ ] **Decide on testing stack and enforce it in CI**

  Nothing is wired up yet. Before cutting a `v1.0` release or accepting external contributions we need a clear answer on each of these:

  **Unit tests (backend)**
  - Candidates: `pytest` + `pytest-asyncio` for FastAPI route handlers, TTS wrapper, DB helpers.
  - Mock the Chatterbox model (slow, GPU-dependent) with a fixture that returns a dummy WAV.
  - Coverage target TBD — recommend ≥80% on `api/` excluding model-loading paths.

  **Integration / end-to-end tests**
  - Spin up the full FastAPI app with `httpx.AsyncClient` + `ASGITransport` — no network needed.
  - Key flows to cover: `POST /tts` happy path, bad voice file, missing text, history pagination, voice CRUD.
  - For the web UI: `playwright` (Python) or `cypress` (JS) — decision deferred; playwright aligns with the existing Python stack.

  **Linting & formatting**
  - Backend: `ruff` (replaces flake8 + isort + pyupgrade in one tool), `black` for formatting.
  - Frontend: `eslint` + `prettier` on `ui/*.html` / `ui/*.js` — or just `prettier` if JS is minimal enough.
  - Shell scripts: `shellcheck` on everything in `scripts/`.

  **Pre-commit hooks**
  - `pre-commit` framework with hooks for ruff, black, shellcheck, and a secret-scanner (e.g. `detect-secrets`) to make sure `.env` tokens can never slip into a commit.

  **CI pipeline**
  - GitHub Actions on push to `main` and on all PRs (once PR workflow is adopted).
  - Jobs: lint → unit tests → (optional) e2e tests against a mocked model.
  - Block merge if any job fails.

  **Decision needed:** agree on the above stack, then implement in a dedicated PR before adding more features.

---

## Logging & Observability

- [ ] **Capture User-Agent in logs and DB**
  - Log the `User-Agent` header alongside `request_id` on every request so we can tell what client made the call (curl, web UI, mobile, third-party integration).
  - Store it in the `jobs` table so it's queryable per generation.
  - Middleware is the right place — already touching every request for `X-Request-ID`.

- [ ] **`GET /logs` endpoint**
  - Query structured log/job data via the API instead of requiring direct SQLite access.
  - Suggested filters: `request_id`, `status`, `date range`, `preset`, `voice`, `user_agent`.
  - Pairs well with the web UI — could power a live job + log dashboard.

---

## Web UI

- [x] Text input with preset selector
- [x] Job history with audio playback
- [x] In-browser voice profile recording (MediaRecorder + live waveform)
- [x] Voice upload and profile management (drag & drop + file picker)
- [x] Custom tone panel (sliders for all 6 TTS params, localStorage persistence)

---

## macOS Menu Bar Helper

- [x] **CPU and RAM stats** — live metrics shown in the menu, polled every 5s via psutil.

- [ ] **Version number and support link in helper menu**
  - Show current version (git tag or short SHA, read at startup) as a non-clickable label near the top of the menu — e.g. `v0.2.0 · build a1b2c3`.
  - Add a `🌐  Visit Support Page` item that opens the landing page or a dedicated support URL in the default browser.
  - Decide on a permanent support URL before implementing (landing page, GitHub repo, or a separate support site).

- [ ] **"Check for Updates" menu item** — before public release, add an ↑ Update option to the helper menu.
  - Runs `scripts/update.sh` in a subprocess (already built — does `git pull` + pip sync + re-registers agents).
  - While running: show "Updating…" status, disable the menu item to prevent double-tap.
  - On success: macOS notification "Vox updated — restarting…" then restart the helper itself.
  - On failure: notification "Update failed — check logs" with no restart.
  - Consider showing current version (git tag or short SHA) in the menu so the user knows what they're on.

- [x] **Update `setup.sh` post-install instructions** — now prints the correct install-agent → install-helper → start flow. Also creates `~/Library/LaunchAgents` and `~/Library/Logs/Vox` so install scripts never fail on a clean macOS install.

- [ ] **Restart transition state — "🟡 Restarting…"**
  - When the user clicks ↺ Restart, immediately set title to `"🟡 Vox"` and status item to `"Restarting…"` before the poll cycle confirms anything.
  - Hold that state for up to ~15s (reasonable worst-case for launchd to stop + start the server).
  - If health check comes back healthy within the window → transition to `🟢 Running…` as normal.
  - If the window expires with no healthy response → transition to `🔴 Stopped…` so the user knows something went wrong.
  - Avoids the confusing jump from Restarting directly to red/Stopped during the normal stop phase of a restart.

- [ ] **GPU / MPS utilization** — `psutil` has no MPS API. Options: parse `powermetrics` (requires sudo, not ideal) or use IOKit via PyObjC (what Stats.app uses). Defer until Swift rewrite investigation is complete — native Swift can access IOKit cleanly.

---

## Packaging & Distribution

- [x] **LaunchAgent — server** — `launchagent/com.melolabdev.vox.plist`. Manual start, crash-restart, logs to `~/Library/Logs/Vox/`.
- [x] **LaunchAgent — menu bar helper** — `launchagent/com.melolabdev.vox-helper.plist`. Auto-starts on login.
- [x] **macOS menu bar helper (rumps)** — status dot, CPU/RAM, server control, copy address, open browser, view logs.

- [x] **Fix `env` label** — server plist now uses `/bin/bash` directly; Login Items shows `bash` instead of `env`.
- [x] **Fix `Python3` label** — `install-helper.sh` creates a `vox-helper → python3` symlink in the venv; helper plist references it by that name so Login Items and Activity Monitor show `vox-helper`.

- [x] **Branding icons — temporary** — `install-helper.sh` builds `VoxHelper.app` at `/Applications/` (permanent — survives project folder deletion) with `Info.plist`, Vox icon, and a symlink to the permanent venv. `assets/Vox.icns` committed to repo.
- [x] **Permanent runtime layout** — everything runtime lives at `~/Library/Application Support/Vox/`: venv, api code, config/presets, helper script, voices, outputs, data, input, .env. Project folder is source-only. Server and helper both survive the project folder being moved or deleted.

- [x] **Revert helper to signed VoxHelper.app bundle**

  Currently the helper LaunchAgent runs `python3` directly from the permanent venv. This works but shows `Python3` in Login Items with no icon. The `.app` bundle approach (already built, see below) fixes both — but requires a signed binary to work on Sequoia without the `?` icon and auto-launch failure.

  **Prerequisites:**
  - Apple Developer ID Application certificate installed in Keychain
  - Team ID from developer.apple.com
  - App-specific password from appleid.apple.com (for notarytool)
  - Xcode (full app) for `notarytool` and `stapler`

  **All assets are already in the repo:**
  - `assets/Vox.icns` — icon (temporary logo, replace before release)
  - `install-helper.sh` — bundle build logic is preserved in git history (commit `cd1077d`)
  - `launchagent/com.melolabdev.vox-helper.plist` — just needs ProgramArguments swapped back

  **Steps to revert when certificate is ready:**

  1. Restore bundle build in `install-helper.sh` — re-add the `VoxHelper.app` build block from commit `cd1077d`:
     ```bash
     APP_BUNDLE="/Applications/VoxHelper.app"
     mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
     cp "$ROOT/assets/Vox.icns" "$APP_BUNDLE/Contents/Resources/Vox.icns"
     # write Info.plist (CFBundleIdentifier, CFBundleDisplayName, CFBundleIconFile, LSUIElement)
     ln -sf "$VENV/bin/python3" "$APP_BUNDLE/Contents/MacOS/vox-helper"
     ```

  2. Update helper plist `ProgramArguments` back to:
     ```xml
     <string>/Applications/VoxHelper.app/Contents/MacOS/vox-helper</string>
     <string>VOX_APP_SUPPORT/menubar/vox_helper.py</string>
     ```

  3. Sign the bundle:
     ```bash
     codesign --deep --force --sign "Developer ID Application: NAME (TEAMID)" /Applications/VoxHelper.app
     ```

  4. Zip, notarize, and staple:
     ```bash
     ditto -c -k --keepParent /Applications/VoxHelper.app VoxHelper.zip
     xcrun notarytool submit VoxHelper.zip --apple-id EMAIL --team-id TEAMID --password APP_PASSWORD --wait
     xcrun stapler staple /Applications/VoxHelper.app
     ```

  5. Re-run `bash scripts/install-helper.sh` — Login Items will show "Vox Helper" with the Vox icon.

- [ ] **Replace temporary logo before public release**
  - `assets/Vox.icns` is a placeholder. The app name "Vox" / "Vox" is not finalised.
  - Once the permanent app name and logo are decided, replace `assets/Vox.icns` with the final `.icns` and update `CFBundleDisplayName` / `CFBundleIdentifier` in `install-helper.sh` to match.
  - The `.icns` should include all required sizes: 16, 32, 64, 128, 256, 512, 1024px.
  - Must be done before App Store submission or any public release.

- [ ] **Auto-launch on login (server)** — flip `RunAtLoad` from `<false/>` to `<true/>` in `launchagent/com.melolabdev.vox.plist` when shipping the `.app`. Helper already auto-starts.

- [ ] **Investigate rewrite in Swift (native macOS)**
  - If Swift rewrite is pursued, also evaluate **Mac App Store distribution**:
    - Requires sandboxing — replace `launchctl` calls with `SMAppService` + XPC
    - Replace `ProgramArguments`-based LaunchAgents with `SMAppService.register()`
    - Submit through App Store Connect, subject to Apple review
    - Discoverability and one-click install for non-technical users
    - App is free so the 30% revenue cut is irrelevant
    - Only worth pursuing if the Swift rewrite happens — do not attempt with the current Python/rumps architecture — rumps works well for v1 but Swift would give: NSPopover with richer UI, SF Symbols, real IOKit GPU stats, tighter macOS integration, single signed binary. Key decision: macOS-only forever (go Swift) or cross-platform later (keep Python). Not a production blocker.

- [ ] **Single-instance enforcement** — prevent multiple server or helper processes from running simultaneously.
  - **Server (`run.sh` / `VoxServer.app`):** write a PID file to `$APP_SUPPORT/vox-server.pid` on start; on startup check if PID exists and process is alive — if so, print "Vox Server is already running (PID $pid). Stop it first: launchctl stop com.melolabdev.vox" and exit 1. Clean up PID file on exit via trap.
  - **Helper (`vox_helper.py`):** on startup check for another instance via `psutil.process_iter` matching the script path — if found, show a `rumps.alert` "Vox Helper is already running. Only one instance can run at a time." and `sys.exit(1)`.
  - **VoxServer.app / VoxHelper.app launchers:** the Swift binary can't show UI, but the underlying process will exit with code 1 and launchd will respect `KeepAlive: SuccessfulExit: false` so it won't loop.
  - Already partially covered by launchd (only one LaunchAgent per label), but direct double-launch of the `.app` bundles is not guarded.

- [ ] **One-click `.app` packaging** — PyInstaller or py2app. Bundle Python, venv, and the server into a single distributable app.

- [ ] **Default `VOX_HOST` to `127.0.0.1`** once packaged as a macOS app.

- [ ] **Streamline /Applications install once signed & notarized** — current workaround unzips to `/tmp` then `sudo mv` into `/Applications` to avoid TCC blocking `ditto` directly. Once the app is properly signed and notarized, replace this with a standard `ditto` directly into `/Applications` (no sudo needed for signed apps, or package as a `.dmg` with a drag-to-Applications installer). Blocked by: Fix Developer ID codesign below.

- [ ] **Fix Developer ID codesign (`errSecInternalComponent`)** — signing currently fails even with cert installed.
  - Cert is present and chain is valid (`F8:3A:0C:69` AKID matches intermediate SKID)
  - Likely cause: private key was generated via Keychain Access GUI with Secure Enclave access controls that block `codesign`
  - Fix: revoke current cert, generate new CSR via CLI (`openssl genrsa` + `openssl req`) to avoid Secure Enclave, re-download cert from Apple Developer portal, import with `-T /usr/bin/codesign`
  - Until resolved: bundles ship unsigned; test devices right-click → Open on first launch
  - `build-apps.sh` will automatically sign once this is fixed (just re-add the `codesign` call)

- [ ] **Code signing & notarization** — required before public release.
  - Blocked by: Fix Developer ID codesign above
  - Sign `.app` bundles via `build-apps.sh`
  - Submit to Apple with `notarytool`, staple with `stapler`
  - Write `scripts/notarize-helper.sh` — submit to Apple with `notarytool`, staple with `stapler`

---

## Non-Verbal Cues

- [ ] **Non-verbal speech cue support**

  **Test results** (`youtube` preset, `noelmo-normal` voice, 2026-06-20):

  | Notation | Example | Result |
  |----------|---------|--------|
  | `*word*` | `*coughing*` | ❌ Says the word literally |
  | `(description)` | `(clears throat)` | ✅ Some effect observed |
  | `[description]` | `[clears throat]` | ✅ Some effect observed |
  | Natural ellipsis | `Uh... excuse me...` | ✅ Works |
  | Standalone | `Ahem...` | ✅ Partial |

  **Next steps:** pre-process text to normalise to best-performing notation; build a cue dictionary; investigate phoneme injection or ffmpeg audio splicing for sounds the model can't produce natively.

---

## Tone Profiles

- [x] **Custom tone with parameter panel** — "✦ Custom" pill opens inline panel with sliders for all 6 TTS params. Validates on save, persists to `localStorage`, collapses/expands without losing selection.

- [ ] **Named custom tone profiles** — save and delete named custom tones (stored in DB). Custom profiles appear as pills alongside built-ins. Built-in tones protected from deletion (`is_builtin=1`). Requires `POST /tones` and `DELETE /tones/{name}` endpoints.

---

## Landing Page

- [ ] **Increase nav and footer text contrast** — nav links (`--text-2: #6E6E73`) and footer copy/links (`--text-3: #AEAEB2`) are too light on some screens. Darken `--text-2` and `--text-3` in `ui/css/vox.css`, or override specifically in `ui/index.html` for the nav and footer elements. Target WCAG AA contrast ratio (4.5:1) against the page background.

- [ ] **Smooth scroll navigation** — nav links animate to each section instead of jumping. `scroll-behavior: smooth` baseline + JS easing curve. Active link highlight updates as user scrolls past sections.

---

## Configuration UI

- [ ] **Decide where to surface settings editing — web UI or menu bar helper**

  **Option A — Web app Settings tab:** editable fields + `PATCH /settings` endpoint writes back to `.env`. "Restart required" banner + button for host/port/device changes.

  **Option B — Menu bar helper:** Settings submenu in rumps, or a proper Preferences window if rewriting in Swift.

  **Recommendation:** if Swift rewrite is happening, hold off and do it natively. If staying with rumps, the web UI Settings tab is the better surface.

---

## Dark Mode

- [ ] **Dark theme** — CSS custom properties already in `vox.css`. Add `[data-theme="dark"]` overrides, manual toggle (moon/sun icon in sidebar footer) persisting to `localStorage`, system preference as default.

---

## History Table

- [ ] **Column visibility toggle** — show/hide columns via a "Columns" dropdown. Persist to localStorage.
- [ ] **CSV export** — download current filtered view. Button in topbar next to Refresh.

---

## Maintenance & Memory

- [ ] **Prune old job rows from SQLite** — cleanup task deletes output files but DB rows accumulate forever. Add `DELETE FROM jobs WHERE created_at < datetime('now', '-30 days')` to the cleanup loop, configurable via `VOX_JOB_RETENTION_DAYS` (default 30).

---

## Installer UX

- [ ] **Interactive installer — unify setup.sh into a single guided script**

  Replace the current multi-script workflow with a single interactive `install.sh` that presents a menu:

  ```
  Vox Installer
  ─────────────
  1) Install
  2) Update
  3) Uninstall
  4) Quit
  ```

  **Install flow:**
  - Run all current `setup.sh` steps
  - Prompt: "Enter your Hugging Face token (optional, press Enter to skip):" → writes to `.env`
  - Prompt: "Install server LaunchAgent? [Y/n]" → runs `install-agent.sh` if yes
  - Prompt: "Install menu bar helper? [Y/n]" → runs `install-helper.sh` if yes
  - Print summary of what was installed and next steps

  **Update flow:**
  - Runs current `update.sh` logic

  **Uninstall flow:**
  - Prompt: "Remove server agent? [Y/n]"
  - Prompt: "Remove menu bar helper? [Y/n]"
  - Prompt: "Remove application data (voices, outputs, database)? [Y/n]" — destructive, default N
  - Runs relevant uninstall scripts

  Keep existing individual scripts (`install-agent.sh`, `install-helper.sh`, `update.sh`, etc.) working as-is — `install.sh` is a convenience wrapper, not a replacement. Power users and CI can still call scripts directly.

- [ ] **Unify uninstall scripts into a single `uninstall.sh`**
  - Merge `uninstall-agent.sh` and `uninstall-helper.sh` into one `scripts/uninstall.sh` with an interactive prompt to choose what to remove.
  - Support flags for non-interactive/CI use:
    - `--all` — remove everything (agent + helper + app bundle)
    - `--agent` — remove server agent only
    - `--helper` — remove helper + app bundle only
    - `--data` — also remove voices, outputs, data, input from Application Support (destructive, off by default)
    - `--yes` — skip all confirmation prompts

- [ ] **Add CLI flags to `install.sh` and `update.sh` for scripted workflows**
  - `install.sh` flags:
    - `--agent` — install server agent only, skip helper
    - `--helper` — install helper only, skip agent
    - `--hf-token TOKEN` — pass Hugging Face token directly, skip prompt
    - `--yes` — accept all prompts non-interactively
  - `update.sh` flags:
    - `--no-restart` — sync files and deps but do not restart agents (useful mid-session)
    - `--agent-only` / `--helper-only` — reinstall only one agent
  - Flags make CI pipelines, automated testing, and power-user workflows possible without interactive input

---

## Installation & Diagnostics

- [ ] **Write install log to `~/Library/Logs/Vox/install.log`**
  - `setup.sh`, `install-agent.sh`, and `install-helper.sh` should tee all output to a timestamped install log so failed installs can be diagnosed without the user having to reproduce the issue in front of you.
  - Each script appends to the same file with a clear header (script name + timestamp + macOS version + architecture).
  - On failure, the error and the last few lines of context are preserved so the exact step that failed is obvious.
  - Suggested implementation: `exec > >(tee -a "$LOG_FILE") 2>&1` at the top of each script after the log dir is created.

---

## Pre-Release Code Review

- [ ] **Full codebase optimization pass** — before cutting v1.0, do a complete review of all code for:
  - Dead code, unused imports, redundant logic
  - API response consistency (error shapes, status codes, headers)
  - SQL queries — missing indexes, N+1 patterns, unbounded SELECTs
  - Python async correctness — any blocking calls on the event loop
  - Security — input validation at API boundaries, path traversal in file endpoints, filename sanitization
  - Memory usage — large objects held longer than needed (model weights, audio buffers)
  - Shell scripts — `set -euo pipefail`, quoting, error messages
  - Frontend JS — dead event listeners, missing error states, console warnings
  - Do this after the testing strategy is in place so issues found can be covered by tests

---

## API & Performance

- [ ] Streaming audio response (chunked transfer encoding)
- [ ] **Generation queue with UI feedback** — replace single `asyncio.Lock` with a proper worker queue.
  - Backend: queue incoming requests when a generation is already in progress; return a job ID immediately with `202 Accepted` and expose `GET /jobs/{id}/status` for polling or SSE.
  - UI: when a request is queued, show the position in queue ("⏳ Queued — position 2") in the generate button area and update live as position changes. Transition to a progress indicator once generation starts.
  - Pair with the sidebar stats item below.
- [ ] **Sidebar stats panel** — use the empty space in the left navigation bar to surface live server stats.
  - Candidates: requests processed (session + all-time), audio minutes generated (session + all-time), current queue depth, average generation time.
  - Pull from existing SQLite job history for all-time counts; track session counts in memory.
  - Update on each completed job — no polling needed if driven by the same SSE stream as queue feedback.
  - Display as a compact, non-interactive stats block near the bottom of the nav sidebar.
- [ ] Server-sent events for real-time generation progress
