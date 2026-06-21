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

- [ ] **Detect missing microphone on page load in the voice recorder**
  - On page load, call `navigator.mediaDevices.enumerateDevices()` and check for any `audioinput` device.
  - If none found: hide the record button and show a persistent inline notice — e.g. "No microphone detected. Connect a USB mic or headset to record." with a "Retry" button that re-runs the check.
  - If found: show the record UI as normal.
  - This avoids the confusing flow where the user clicks record, nothing happens, and an error appears after the fact. Especially relevant on desktop machines (Mac Mini, Mac Pro) with no built-in mic.


- [x] Text input with preset selector
- [x] Job history with audio playback
- [x] In-browser voice profile recording (MediaRecorder + live waveform)
- [x] Voice upload and profile management (drag & drop + file picker)
- [x] Custom tone panel (sliders for all 6 TTS params, localStorage persistence)

---

## macOS Menu Bar Helper

- [x] **CPU and RAM stats** — live metrics shown in the menu, polled every 5s via host_statistics / vm_statistics64.

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

- [ ] **GPU / MPS utilization** — no public API. Options: parse `powermetrics` (requires sudo) or use IOKit (what Stats.app uses). Helper is now native Swift so IOKit access is straightforward when ready.

---

## Packaging & Distribution

- [x] **LaunchAgent — server** — `launchagent/com.melolabdev.vox.plist`. Manual start, crash-restart, logs to `~/Library/Logs/Vox/`.
- [x] **LaunchAgent — menu bar helper** — `launchagent/com.melolabdev.vox-helper.plist`. Auto-starts on login.
- [x] **macOS menu bar helper (native Swift)** — status dot, CPU/RAM, server control, copy address, open browser, view logs.

- [x] **Fix `env` label** — server plist now uses `/bin/bash` directly; Login Items shows `bash` instead of `env`.
- [x] **Fix `Python3` label** — helper rewritten in native Swift; shows as "Vox Helper" in Login Items and Activity Monitor.

- [x] **Branding icons — temporary** — `install-helper.sh` builds `VoxHelper.app` at `/Applications/` (permanent — survives project folder deletion) with `Info.plist`, Vox icon, and a symlink to the permanent venv. `assets/Vox.icns` committed to repo.
- [x] **Permanent runtime layout** — everything runtime lives at `~/Library/Application Support/Vox/`: venv, api code, config/presets, helper script, voices, outputs, data, input, .env. Project folder is source-only. Server and helper both survive the project folder being moved or deleted.

- [x] **Rewrite VoxHelper in native Swift** — replaced Python/rumps with a native AppKit app (`voxhelper/`). Eliminates PyObjC teardown hang, macOS Sequoia NSSceneStatusItem session context issue, and Python3 in Background Apps. Shows "Vox Helper" in Login Items with the Vox icon.

- [ ] **App Background Activity branding in System Settings**
  - Both LaunchAgents currently appear under "Noelmo Melo" (the Developer ID name) with no custom icon in System Settings → General → Login Items & Extensions → App Background Activity.
  - Two sub-issues to resolve:
    1. **Icon** — `VoxHelper.app` and `VoxServer.app` bundles need a valid `CFBundleIconFile` that macOS picks up for the Login Items UI. Verify `Vox.icns` is correctly referenced and sized — macOS may require specific icon sizes (16, 32, 64px) to display in this context.
    2. **Developer label** — the grouping label comes from the Developer ID certificate name ("Noelmo Melo"). Options to make it more brand-friendly: register a company/org name with Apple (e.g. "MeloLabDev") and reissue the cert under that name, or use a vanity domain like `noelmom.github.io` or `melolabdev.com` as the org identifier. Decide on permanent brand name before reissuing — cert changes require re-signing and re-notarizing all apps.
  - Blocked by: final brand name decision and logo replacement.

- [ ] **Replace temporary logo before public release**
  - `assets/Vox.icns` is a placeholder. The app name "Vox" / "Vox" is not finalised.
  - Once the permanent app name and logo are decided, replace `assets/Vox.icns` with the final `.icns` and update `CFBundleDisplayName` / `CFBundleIdentifier` in `install-helper.sh` to match.
  - The `.icns` should include all required sizes: 16, 32, 64, 128, 256, 512, 1024px.
  - Must be done before App Store submission or any public release.

- [ ] **Auto-launch on login (server)** — flip `RunAtLoad` from `<false/>` to `<true/>` in `launchagent/com.melolabdev.vox.plist` when shipping the `.app`. Helper already auto-starts.

- [ ] **Login item toggles in the helper menu** — add "Start Helper at Login" and "Start Server at Login" checkable menu items to VoxHelper. Each reads the current `RunAtLoad` value from the installed plist, reflects it as a checkmark, and toggles it by rewriting the plist + calling `launchctl unload` / `launchctl load`. Useful for users who want to control what runs on startup without touching the terminal.

- [ ] **Mac App Store distribution** — requires sandboxing: replace `launchctl` calls with `SMAppService` + XPC, replace LaunchAgent plists with `SMAppService.register()`. Helper is already native Swift so this is the natural next step for public distribution.

- [x] **Single-instance enforcement** — VoxHelper uses `fcntl F_SETLK` on `.helper.lock`; OS releases lock on process exit. Server uses port connectivity check in `run.sh` before exec'ing uvicorn.

- [ ] **Single-instance enforcement (server — PID file)** — `run.sh` port check works but a PID file would give cleaner error messages and survive edge cases where the port is in use by another process.

- [ ] **Signed `.pkg` installer for v1.0.0 release** — replace the DMG + `vox.sh` workflow with a single signed and notarized `.pkg` that handles everything: installs `VoxHelper.app` and `VoxServer.app` to `/Applications`, creates the LaunchAgents, sets up the runtime directory, and runs first-time setup. Built with `pkgbuild` + `productbuild`. Requires a Developer ID Installer certificate (separate from Developer ID Application). This is the target distribution format for v1.0.0 — clean one-double-click install with no terminal required.

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

> ⚠️ **Post-v1.0 roadmap item** — not a launch blocker. Requires voice profile architecture changes before implementation.

- [ ] **Non-verbal speech cue support — voice-profile-bound audio splicing**

  **Concept:** users record short non-verbal audio clips (cough, laugh, throat clear, sigh, etc.) tied to a specific voice profile. In the generator, tagging text with a cue like `<cough>` or `**cough**` automatically splices in the real recorded audio at that point — making output sound natural and human rather than synthesized.

  **Tag format (TBD):** pick one consistent syntax across the product. Candidates:
  - `<cough>` — XML-style, clear and easy to parse
  - `**cough**` — markdown-style, familiar to users
  - `[cough]` — bracket-style (some effect observed in model testing)

  **Architecture changes needed:**
  - **Voice profile redesign** — profiles currently store a single reference WAV. Need to expand to a profile bundle: reference audio + a named library of non-verbal clips (e.g. `noelmo-normal/cough.wav`, `noelmo-normal/laugh.wav`).
  - **Text pre-processing pipeline** — before TTS, scan input for cue tags, extract their positions, strip them from the text sent to the model.
  - **Audio splicing** — after TTS generation, use ffmpeg to splice real recorded clips into the synthesized audio at the correct timestamps. Requires estimating splice points from character/word position in the output.
  - **Generator UI** — surface which cues are available for the selected voice profile so users know what tags they can use.
  - **Recording UI** — extend the voice profile recorder to support recording and managing non-verbal clips per profile.

  **Test results so far** (`youtube` preset, `noelmo-normal` voice, 2026-06-20):

  | Notation | Example | Result |
  |----------|---------|--------|
  | `*word*` | `*coughing*` | ❌ Says the word literally |
  | `(description)` | `(clears throat)` | ✅ Some effect observed |
  | `[description]` | `[clears throat]` | ✅ Some effect observed |
  | Natural ellipsis | `Uh... excuse me...` | ✅ Works |
  | Standalone | `Ahem...` | ✅ Partial |

  **Decision needed before implementation:** agree on tag syntax, voice profile bundle structure, and whether to store non-verbal clips in the DB or filesystem alongside the reference WAV.

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

## Backup & Restore

- [ ] **Backup and restore** — explore options for backing up and restoring user data.
  - Scope: voices, outputs, SQLite DB, `.env`, custom tones, presets — everything under `~/Library/Application Support/Vox/` except the venv and synced code.
  - Options to evaluate: export to a single `.zip` archive, iCloud Drive sync, Time Machine exclusion/inclusion guidance, manual rsync to external drive.
  - Restore flow: import archive, verify integrity, restart server.
  - Surface in the web UI (Settings tab) or via a `vox.sh backup` / `vox.sh restore` command.

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

## One-Liner Remote Install

- [ ] **curl/wget one-liner installer**
  - Allow installing Vox with a single command, no git clone required:
    ```bash
    curl -fsSL https://raw.githubusercontent.com/MeloLabDev/codename-vox/main/vox.sh | bash -s install
    ```
  - `vox.sh` already handles the full install flow — this just removes the clone step for end users.
  - Requirements before enabling: code signing & notarization done, repo public or install token approach decided, `vox.sh` downloads the full source itself (zip from latest release) rather than relying on the local project folder being present.
  - Consider hosting on a vanity URL (e.g. `get.vox.app`) that redirects to the raw GitHub URL so the command stays short and the URL is decoupled from the repo location.
  - Blocked by: public release readiness (signed app, stable v1.0).

---

## Version Tracking

- [ ] **Track installed version and prevent redundant installs/updates**
  - Write the current git SHA (or version tag) to `~/Library/Application Support/Vox/version` at the end of install and update.
  - On `vox.sh install`: if a version file exists, compare against the current source — warn if already on the same version and ask to reinstall or skip.
  - On `vox.sh update`: compare installed version against latest available (git `HEAD` for clones, or a `version` file in the source folder for zip updates) — if already up to date, print "Already on latest version (abc1234)" and exit cleanly without restarting agents.
  - On `vox.sh` interactive menu: display the currently installed version.
  - For zip-based installs where there's no git: include a `version` file in the zip at build time so the comparison still works.

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
