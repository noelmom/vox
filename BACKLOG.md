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
  - Frontend: `eslint` + `prettier` on `ui-src/src/**/*.{ts,tsx}` — Vite projects typically pair `eslint` with the `@typescript-eslint` and `eslint-plugin-react-hooks` plugins.
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

- [x] **[REGRESSION] Voice recorder — no distinction between "no microphone device" and "microphone access denied"**

  Implemented in `ui-src/src/routes/app.library.tsx`. The React voice recorder now has distinct `no-device`, `denied`, and `insecure-context` states, runs a preflight check on mount, uses microphone permission state where available, and shows tailored recovery copy/actions for each case.

  These are three different problems requiring three different messages and recovery actions:

  | Case | Cause | Correct message | Recovery action |
  |---|---|---|---|
  | No device | `navigator.mediaDevices.getUserMedia` throws `NotFoundError` / `DevicesNotFoundError`, or `enumerateDevices()` returns no audio input devices | "No microphone found. Connect a microphone and try again." | "Refresh" button |
  | Access denied | Throws `NotAllowedError` / `PermissionDeniedError` | "Microphone access was denied. Allow access in System Settings → Privacy & Security → Microphone." | Link or button to open System Settings, plus "Try again" button |
  | Insecure context (HTTP) | `navigator.mediaDevices` is `undefined` — browsers block microphone API entirely on non-`localhost` HTTP origins | "Microphone access requires a secure connection. Open Vox over HTTPS or use it on localhost." | Explain why, no retry possible without switching to HTTPS |

  **The HTTP / insecure context case:**
  - Browsers (Chrome, Safari, Firefox) restrict `navigator.mediaDevices` and `getUserMedia` to [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) only — HTTPS or `localhost`. When accessed via a Cloudflare tunnel the connection is HTTPS so this is fine, but if someone accesses the server directly via `http://192.168.x.x:8000` from another device on the LAN, `navigator.mediaDevices` will be `undefined` and any call to it throws.
  - Detect by checking `window.isSecureContext` or `navigator.mediaDevices == null` before calling `getUserMedia`.
  - The error message should explain the root cause clearly — this is not a permission issue and not a hardware issue, it's a browser security policy. The user needs to either: (a) use the Cloudflare tunnel URL (HTTPS), or (b) access via `localhost` directly on the Mac running Vox.

  **Implementation notes:**
  - Check order: `isSecureContext` first → `NotFoundError` → `NotAllowedError` → fallback generic error. Doing them in this order ensures the HTTP error is caught before even attempting `getUserMedia`.
  - Pre-check with `navigator.permissions.query({ name: 'microphone' })` where supported to detect denied state before even calling `getUserMedia`, so the error shows immediately on component mount rather than after a failed attempt.
  - On macOS, a denied browser permission requires the user to go to System Settings → Privacy & Security → Microphone — make that path explicit in the error copy rather than a vague "check your settings."
  - Also handle `OverconstrainedError` (device exists but doesn't satisfy constraints) gracefully with a generic fallback.

  File: `ui-src/src/routes/app.library.tsx` — `RecordPane` component. The `classifyMicError` function is the right place to add the `isSecureContext` check.

- [x] **[BLOCKER — v1.0.0] Git not installed — macOS prompts to install Developer Tools and terminal command fails**

  On a fresh macOS machine without Xcode Command Line Tools, running any `git` command (including `bash vox.sh install` or `bash vox.sh update`) triggers a system dialog: *"The git command requires the command line developer tools. Would you like to install the tools now?"*. The terminal command hangs waiting for the dialog, and if the user dismisses it, the install fails with a confusing error.

  **Who hits this:** any new user on a stock macOS machine who has never installed Xcode or the CLT package. More common than expected — macOS ships without git since Catalina.

  **Options to consider:**
  - **Check for git before running** — add a guard near the top of `setup.sh` / `vox.sh` that runs `command -v git` and exits with a clear human-readable message if not found, rather than letting macOS intercept the call with a confusing dialog.
  - **Trigger CLT install explicitly** — `xcode-select --install` launches the same dialog intentionally, and the script can wait for it to complete (`xcode-select -p` exits 0 once done). This lets the installer handle git as a dependency rather than asking the user to do it separately.
  - **Document in README / FAQ** — at minimum, note the prerequisite and link to the one-liner (`xcode-select --install`) before the install steps.
  - **`.pkg` installer path** — if the v1.0.0 `.pkg` installer handles setup, it can bundle or pre-check this dependency at install time, bypassing the terminal issue entirely.

  **Implemented short-term fix:** `vox.sh`, `scripts/update.sh`, and `setup.sh` now check for git / Xcode Command Line Tools and show `xcode-select --install` guidance instead of falling into the confusing macOS prompt/failure path.

  **Longer term:** FAQ entry and/or handle it inside the `.pkg` installer flow.

- [x] **[BLOCKER — v1.0.0] Finish real audio waveform visualisation across every audio-bearing surface**

  Verified in `ui-src/src/routes/app.index.tsx`, `ui-src/src/routes/app.library.tsx`, `ui-src/src/routes/app.recordings.tsx`, `ui-src/src/components/TrimWaveform.tsx`, and `ui-src/src/lib/audio-trim.ts`. Audio-bearing players decode fetched/recorded/uploaded audio into real amplitude buckets, live recording uses `AnalyserNode`, and trim controls render decoded peaks. Deterministic bars remain only as loading/prefetch skeletons before audio is available, disabled generic preview decoration, and landing-page decoration.

  **Affected components (all in `ui-src/src/routes/`):**
  - `app.library.tsx` — `Waveform` (animated flag, used in RecordPane and UploadPane preview) and `MiniWave` (decorative bar in ProfileCard footer)
  - `app.index.tsx` — waveform / playback visualiser in the Result/output area

  **Recommended approach — Web Audio API + canvas/SVG:**
  1. For **static previews** (uploaded file, generated clip at rest): decode the audio buffer once with `AudioContext.decodeAudioData`, downsample the PCM into ~120 amplitude buckets, render as an SVG bar chart. This gives a true "fingerprint" of the audio.
  2. For **live recording** (RecordPane): use `AnalyserNode` fed from the `MediaStream`, `requestAnimationFrame` polling `getByteFrequencyData`, render to a `<canvas>` for smooth real-time animation.
  3. For **playback scrubbing** (ProfileCard, Result): overlay a progress indicator that advances with `timeupdate` on the `<audio>` element so the static fingerprint doubles as a seek bar.

  **Constraints:**
  - Keep decode/render off the main thread where possible — use `OfflineAudioContext` for the static decode step.
  - Waveform colour should follow the existing oklch palette (accent `oklch(0.55 0.22 260)` at ~55% opacity for bars, brighter for the played-through portion).
  - `MiniWave` in ProfileCard footer can stay decorative but should at least use the real amplitude data from the voice sample if it has already been fetched; fall back to the current fake bars only while the audio hasn't loaded yet.

  **Why a blocker:** fake waves actively undermine trust in the output quality. Users expect to see their voice reflected in the waveform before committing to "Use" a profile or downloading a clip.

- [ ] **[LOW] Migrate existing user preset names to lowercase in DB**

  Preset names are now normalized to lowercase at save time (both frontend and backend). Any presets saved before this change may still have mixed-case names in `user_presets.name`, which could cause duplicate chips or mismatched tone selection.

  **Fix:** run a one-time migration `UPDATE user_presets SET name = lower(name)` and handle any conflicts (keep the most recently created row if two names collide after lowercasing). This can be added to the additive migrations loop in `api/core/db.py` — but since it's destructive (data change, not schema change), it needs a version guard to only run once (e.g. check a `meta` table or use a flag column).

  **Priority:** low — only affects users who saved presets before the normalization fix landed.

- [x] **[MEDIUM] Custom tone edit flow — "Update" vs "Save As" split action**

  Implemented in `ui-src/src/routes/app.index.tsx`. Saved user presets now expose `Update`, `Save As`, `Edit`, and `Remove` actions, with responsive 2-by-2 button wrapping when space is tight. The edit panel close button stays within bounds.

  **Proposed UI — split action when editing an existing custom preset:**

  When the selected tone is a user-created preset (not a built-in like Default / YouTube / Hype / News) and the sliders have been modified, show two buttons instead of one:

  - **Update** — overwrites the current preset with the new slider values, keeping the same name. No confirmation needed (it's reversible by re-saving). Button label: `Update "[preset name]"`.
  - **Save As** — opens the existing name input form to create a new preset from the current slider values. Pre-fills the name field with `"[preset name] 2"` or similar to make it easy to derive a variant.

  When the selected tone is `Custom` (not saved yet), keep the current single `Save Preset` button — there is no "existing" preset to update.

  **State logic:**
  - Track whether the active tone is a user preset (`isUserPreset: boolean`) and whether sliders diverge from that preset's saved values (`isModified: boolean`).
  - Show split buttons only when `isUserPreset && isModified`.
  - On Update: call `PATCH /presets/{name}` (or `savePreset(name, values)` which upserts) and flash a brief "Updated" confirmation inline.
  - On Save As: open the name input pre-filled, let user edit the name, then call `savePreset(newName, values)`.

  **Where to implement:** `ui-src/src/routes/app.index.tsx` — the tone section around the `savePresetOpen` state and the `Save Preset` button (currently around line 919–1003).

  **Open question:** should the Update path show an undo/revert option for a few seconds after saving, so users can roll back a mis-click? Probably a nice-to-have for v2.

- [x] **[LOW] Move generation progress out of the Generate button**

  Implemented in `ui-src/src/routes/app.index.tsx` and `ui-src/src/routes/app.tsx`. The Generate button stays focused on submission state, while queued/running progress is shown in the Create result panel and compact global status bar with elapsed time, estimate/finalizing state, and cancel controls. This avoids overcrowding the button while still giving users visible progress during long generations.

  **Future refinement:** once SSE or explicit chunk-progress events exist, replace the current ETA-style progress estimate with true chunk completion progress.

- [x] **[LOW] Recent scripts history — quick re-use from script box**

  Implemented in `ui-src/src/routes/app.index.tsx`. Generated scripts are saved to `localStorage["vox:script-history"]`, capped at 10 entries, deduped newest-first, and exposed from the script box history dropdown.

  **Implementation notes:**
  - Store as a JSON array in `localStorage["vox:script-history"]`, capped at 10 entries (newest first). Trim duplicates before pushing.
  - Save to history at the moment the Generate button is pressed (inside the existing `handleGenerate` function in `app.index.tsx`).
  - The trigger button sits in the script box toolbar where the Clock icon was removed; restore the icon + button and wire up a `DropdownMenu` from `@/components/ui/dropdown-menu`.
  - Each dropdown item shows the first ~80 chars of the script followed by an ellipsis if truncated.
  - Limit is 10 entries for now; make it configurable via Settings later (low priority).

- [ ] **[LOW] Top-bar header actions — deferred to future release**

  Three buttons were removed from the top-right of the app header (`app.tsx`) pending future implementation. Re-add them when the features are ready. All used `lucide-react` icons and the `IconBtn` helper component (also removed — trivial to restore).

  1. **Dark mode toggle** (`Sun` icon) — switch between light and dark themes. Will require a theme context/provider and Tailwind dark-mode class strategy. Suggested key: `vox:theme` in localStorage.

  2. **Notifications bell** (`Bell` icon) — silence/unmute in-app alerts. Intended to pair with a future alert system that notifies when a generation completes or errors. Backend already has an `/alerts` router stub. Suggested key: `vox:notifications` in localStorage.

  3. **User profile / account** (`ChevronDown` + avatar initials) — not needed for local single-user deployment but useful if multi-user or cloud sync is ever added. Low priority. Would need an auth layer.

---

- [x] **[HIGH] Rethink generation error display — replace ephemeral toast with persistent, actionable error UI**

  Implemented for generation failures in `ui-src/src/routes/app.index.tsx`. Failed jobs render a persistent inline error card with the server message, request ID, copy action, Retry, and Dismiss.

  **Proposed approach — inline error state in the Generate panel:**
  - When a generation fails, replace the progress bar / player area with a persistent inline error card that stays until the user dismisses or retries
  - Show: a clear error heading ("Generation failed"), the server's error message in a readable monospace block, the request ID for support, and two actions: **Retry** and **Dismiss**
  - Color: red/danger styling, not a neutral toast
  - Do not auto-dismiss — the user should choose to acknowledge it

  **Error card should include:**
  ```
  ✕  Generation failed
  ─────────────────────────────────
  Voice file missing on disk.
  Re-upload the voice profile to fix this.

  Request ID: 90ad88fe-eb79-402e-8033  [Copy]

  [↺ Retry]  [Dismiss]
  ```

  **Remaining follow-up:** voice upload failures, voice delete failures, and network/offline errors should still move from transient feedback into local inline/banner states.

  **Other surfaces to update:**
  - Voice upload failures: currently show a toast; should show an inline error below the upload zone
  - Voice delete failures: inline error on the card, not a toast
  - Network/offline errors: persistent banner at top of screen

  **Why:** A 4+ minute generation that fails silently with a 3-second toast is one of the worst UX patterns in a long-running-task app. The user waited, the result is gone, and the error is already gone too.

- [ ] **System alert banner framework**

  A general-purpose dismissible banner system (below the topbar) for surfacing critical server-side conditions to the user. Banners are persistent until dismissed and should not auto-hide.

  **Backend:** Add a `GET /alerts` endpoint that returns a list of active alerts. The server evaluates conditions on each call and returns structured entries:
  ```json
  [
    { "id": "low_disk", "level": "warning", "message": "Disk space is low (2.1 GB free). Old outputs may not be cleaned up in time." },
    { "id": "no_ffmpeg", "level": "error", "message": "ffmpeg not found. MP3 export will fail." }
  ]
  ```

  **Frontend:** On app load (and periodically, e.g. every 5 minutes), call `/alerts` and render any active banners below the topbar. Dismissed banners are stored in `sessionStorage` by `id` so they don't re-appear until the next session.

  **Initial conditions to implement:**
  - Low disk space (e.g. < 1 GB free on the output volume)
  - ffmpeg missing or not executable (MP3 export broken)
  - Output directory not writable

  **Future conditions to add as needed:**
  - Model not yet downloaded / cache missing
  - GPU unavailable, falling back to CPU

- [x] **Detect missing microphone on page load in the voice recorder**
  - Distinct `no-device` vs `denied` vs `insecure-context` states with tailored error UI and recovery actions are implemented in `RecordPane`.
  - Device selector dropdown when multiple mics available (`enumerateDevices()` after permission grant).
  - Implemented in `ui-src/src/routes/app.library.tsx` `RecordPane`.


- [x] Text input with preset selector
- [x] Job history with audio playback
- [x] In-browser voice profile recording (MediaRecorder + live waveform)
- [x] Voice upload and profile management (drag & drop + file picker)
- [x] Custom tone panel (sliders for all 6 TTS params, localStorage persistence)

---

## macOS Menu Bar Helper

- [x] **CPU and RAM stats** — live metrics shown in the menu, polled every 2s via host_statistics / vm_statistics64. Startup takes a second baseline CPU sample so the first visible update is not stuck at 0%, and RAM includes compressed memory in the used value.

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

- [x] **GPU / MPS utilization** — VoxHelper now uses best-effort IOKit accelerator performance counters from native Swift. The helper menu shows `GPU N%` when macOS exposes a usable counter and `GPU unavailable` otherwise; no `powermetrics`, sudo, or shell sampling required.

---

## Update Script

- [x] **Skip app replacement when VoxServer and VoxHelper are already current**

  `vox.sh update` previously re-copied both app bundles unconditionally, even when the DMG hadn't changed and the installed apps were identical. This was wasteful and could fail after a signed `.pkg` install because the installed `/Applications/Vox/*.app` bundles may be root-owned.

  **Detection approach:**
  - Read the installed app's version from its `Info.plist`:
    ```bash
    installed=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" \
      /Applications/Vox/VoxHelper.app/Contents/Info.plist 2>/dev/null)
    bundled=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" \
      "$MOUNT_POINT/VoxHelper.app/Contents/Info.plist" 2>/dev/null)
    ```
  - Compare `$installed` vs `$bundled` (version string from `build-apps.sh`). If equal → skip reinstall for that app.
  - Do the same comparison for `VoxServer.app` (installed at `/Applications/Vox/VoxServer.app`).
  - Each app is checked and skipped independently — helper may be current while server needs update.

  **What gets skipped when app version is unchanged:**
  - `ditto` copy of the app bundle from DMG
  - privileged `rm -rf` of the installed app bundle
  - ownership changes on the installed app bundle

  **What always runs regardless:**
  - `git pull` (already conditional on diff)
  - Python dependency sync (`pip install -r requirements.txt`)
  - API/UI code sync to Application Support
  - LaunchAgent plist refresh/reload so the existing update flow still restarts cleanly

  **Future refinement — LaunchAgent reload vs server restart are separate concerns:**
  The LaunchAgent only needs to be unloaded/reloaded when the plist itself changes (new port, args, env vars) or when the app binary is replaced. Python code changes (API, UI) do **not** require a plist reload — the server just needs to be restarted so the new code is picked up by the running process. The update script should therefore:
  - Skip `launchctl unload/load` when neither the app binary nor the plist has changed
  - Always stop + start the server process at the end of update so fresh Python code is active
  - Communicate clearly in output: "Reloading LaunchAgent (binary updated)" vs "Restarting server (code updated)"

  **Output:**
  ```
  [vox] VoxServer.app already at v0.4.1 — skipping reinstall
  [vox-helper] VoxHelper.app already at v0.4.1 — skipping reinstall
  ```
  vs current: `⚠ Already up to date — reinstalling agents anyway.`

  **Follow-up:** version bump workflow — `CFBundleShortVersionString` in `build-apps.sh` must be kept in sync with the git tag. Covered by the vox.yaml unified version tracking backlog item.

## Packaging & Distribution

- [x] **LaunchAgent — server** — `launchagent/com.melolabdev.vox.plist`. Manual start, crash-restart, logs to `~/Library/Logs/Vox/`.
- [x] **LaunchAgent — menu bar helper** — `launchagent/com.melolabdev.vox-helper.plist`. Auto-starts on login.
- [x] **macOS menu bar helper (native Swift)** — monochrome VOX status icon, CPU/RAM, server control, copy address, open browser, view logs.

- [x] **Fix `env` label** — server plist now uses `/bin/bash` directly; Login Items shows `bash` instead of `env`.
- [x] **Fix `Python3` label** — helper rewritten in native Swift; shows as "Vox Helper" in Login Items and Activity Monitor.

- [x] **Branded app icons** — `VoxHelper.app` and `VoxServer.app` use separate signed `.icns` assets and install under `/Applications/Vox/` so the app bundles survive project folder deletion while staying grouped together.
- [x] **Permanent runtime layout** — everything runtime lives at `~/Library/Application Support/Vox/`: venv, api code, config/presets, helper script, voices, outputs, data, input, .env. Project folder is source-only. Server and helper both survive the project folder being moved or deleted.

- [x] **Rewrite VoxHelper in native Swift** — replaced Python/rumps with a native AppKit app (`voxhelper/`). Eliminates PyObjC teardown hang, macOS Sequoia NSSceneStatusItem session context issue, and Python3 in Background Apps. Shows "Vox Helper" in Login Items with the helper app icon.

- [ ] **App Background Activity branding in System Settings**
  - Both LaunchAgents currently appear under "Noelmo Melo" (the Developer ID name) with no custom icon in System Settings → General → Login Items & Extensions → App Background Activity.
  - Two sub-issues to resolve:
    1. **Icon** — `VoxHelper.app` and `VoxServer.app` bundles have valid `CFBundleIconFile` entries backed by `assets/VoxHelper.icns` and `assets/VoxServer.icns`. Verify whether macOS System Settings picks those up in the Login Items UI; macOS may still group the background activity under the Developer ID label.
    2. **Developer label** — the grouping label comes from the Developer ID certificate name ("Noelmo Melo"). Options to make it more brand-friendly: register a company/org name with Apple (e.g. "MeloLabDev") and reissue the cert under that name, or use a vanity domain like `noelmom.github.io` or `melolabdev.com` as the org identifier. Decide on permanent brand name before reissuing — cert changes require re-signing and re-notarizing all apps.
  - Blocked by: final brand name decision and logo replacement.

- [x] **Replace temporary app icons before public release**
  - Replaced the legacy `assets/Vox.icns` placeholder with separate final-style app icons: `assets/VoxHelper.icns` and `assets/VoxServer.icns`.
  - `scripts/build-apps.sh` writes matching `CFBundleIconFile` values for each app bundle.
  - The old shared `assets/Vox.icns` file has been removed.

- [ ] **Auto-launch on login (server)** — flip `RunAtLoad` from `<false/>` to `<true/>` in `launchagent/com.melolabdev.vox.plist` when shipping the `.app`. Helper already auto-starts.

- [ ] **Login item toggles in the helper menu**

  Add "Start Helper at Login" and "Start Server at Login" as checkable `NSMenuItem`s in a new Settings section above Quit (separated by a divider).

  **Behavior:** toggling only changes whether the agent auto-starts at next login — the currently running process is unaffected. No warning dialog needed; the toggle is reversible and self-explanatory.

  **Implementation (all in `StatusBarController.swift`):**
  - Two new menu items with `.state` (`.on`/`.off`) for the checkmark
  - **Read state:** `NSDictionary(contentsOfFile: plistPath)` → read `RunAtLoad` bool → set checkmark on menu open (or on `apply()` each poll cycle)
  - **Toggle:** flip `RunAtLoad` in the dict, write back with `NSDictionary.write(to:atomically:)`, then `monitor.launchctl("unload", plistPath)` + `monitor.launchctl("load", plistPath)` to apply
  - Plist paths:
    - Helper: `~/Library/LaunchAgents/com.melolabdev.vox-helper.plist`
    - Server: `~/Library/LaunchAgents/com.melolabdev.vox.plist`
  - No changes needed to `ServerMonitor.swift`

- [ ] **Mac App Store distribution** — requires sandboxing: replace `launchctl` calls with `SMAppService` + XPC, replace LaunchAgent plists with `SMAppService.register()`. Helper is already native Swift so this is the natural next step for public distribution.

- [x] **Single-instance enforcement** — VoxHelper uses `fcntl F_SETLK` on `.helper.lock`; OS releases lock on process exit. Server uses port connectivity check in `run.sh` before exec'ing uvicorn.

- [ ] **Single-instance enforcement (server — PID file)** — `run.sh` port check works but a PID file would give cleaner error messages and survive edge cases where the port is in use by another process.

- [ ] **Signed `.pkg` installer for v1.0.0 release** — replace the DMG + `vox.sh` workflow with a single signed and notarized `.pkg` that handles everything: installs `VoxHelper.app` and `VoxServer.app` to `/Applications/Vox/`, creates the LaunchAgents, sets up the runtime directory, and runs first-time setup. Built with `pkgbuild` + `productbuild`. Developer ID Installer signing and package notarization are working; remaining work is the package bootstrap/postinstall flow.

- [ ] **One-click `.app` packaging** — PyInstaller or py2app. Bundle Python, venv, and the server into a single distributable app.

- [x] **Default `VOX_HOST` to `127.0.0.1`** — Vox now defaults to local-only access. Users can opt into LAN access by setting `VOX_HOST=0.0.0.0` or using Settings → Runtime → Network access.

- [x] **Preserve app bundle signatures during build/install** — `build-apps.sh`, `install-helper.sh`, and `install-agent.sh` use `ditto` instead of recursive copy for `.app` bundles, and helper install stops the running helper before replacing `/Applications/Vox/VoxHelper.app`.

- [ ] **Streamline /Applications install UX once packaging is finalized** — current helper install still copies into `/Applications` via the install script. For public release, replace the terminal-driven install/update flow with a drag-to-Applications DMG or signed `.pkg` installer so users do not need to run shell commands.

- [x] **Fix Developer ID codesign (`errSecInternalComponent`)** — Developer ID Application signing, Developer ID Installer signing, notarization, and stapling now work through `scripts/build-apps.sh` and `scripts/build-pkg.sh`.
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

## Voice Sources

- [ ] **[LOW] Remote audio source for voice profiles — URL import with trim**

  Add a third tab to the Voices page ("URL") alongside Upload and Record. The user pastes a direct audio URL, previews the audio in-browser, optionally trims it to a start/end range, then saves it as a voice profile.

  **UI flow:**
  1. User pastes a URL into a text field and clicks "Load" (or presses Enter).
  2. App fetches the audio on the server side (avoids CORS) via a new `POST /voices/fetch` endpoint and streams it into a temporary preview slot.
  3. Trim controls appear — two range handles (start / end) on a waveform scrubber, similar to a video editor trim bar. Default: full clip. User drags handles to select the portion to use.
  4. Voice name + tags fields below, then "Create Voice Profile" creates the profile from the trimmed audio.

  **Server-side implementation (`POST /voices/fetch`):**
  - Accept `{ url: str, trim_start_s?: float, trim_end_s?: float }` JSON body.
  - Validate URL scheme is `http` or `https`; reject non-audio content-types.
  - Download to a temp file (bounded — refuse > e.g. 50 MB or > 10 min of audio).
  - If trim params provided, use ffmpeg to cut the segment: `ffmpeg -ss {start} -to {end} -i input.wav -c copy output.wav`.
  - Convert to WAV via the existing `convert_to_wav` helper.
  - Register as a voice profile (reuse `_register_voice`).

  **Security considerations:**
  - Validate URL before fetching — reject `file://`, `ftp://`, private IP ranges (`127.x`, `10.x`, `192.168.x`, `172.16–31.x`, `169.254.x`), and localhost to prevent SSRF.
  - Cap download size and duration.
  - Only accept `audio/*` Content-Type from the remote server.

  **Why low priority:** upload and record cover the primary workflows. URL import is a convenience for users who want to pull a clip from a podcast, YouTube download link, or file host without downloading it locally first.

- [ ] **[LOW] Voice profile icon size limit — make configurable**

  The custom icon upload on the Library edit form currently hard-codes a 100 KB max file size. Make this configurable so users with high-res displays can opt in to larger icons without code changes.

  **Implementation notes:**
  - Add `voice_icon_max_kb: int = 100` to `api/core/config.py` (Settings model).
  - Expose it via the `GET /settings` endpoint as `"voice_icon_max_kb"`.
  - Read it in the Library edit form (`EditForm` component in `app.library.tsx`) from the settings query instead of the hard-coded constant.
  - Update the UI hint text dynamically: `"max ${maxKb} KB"`.

  **Why low priority:** 100 KB is plenty for small circular avatars. This is a polish item for power users.

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

  **Test results so far** (`confident`/legacy `default` preset, `noelmo-normal` voice, 2026-06-20):

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

- [x] **Named custom tone profiles** — user presets are stored in SQLite via `/api/v1/presets`, appear alongside built-ins, and can be saved, updated, renamed, or deleted from the Create page. Built-ins are protected in the UI.

---

## Landing Page

- [x] **[BLOCKER — v1.0.0] Install window background indistinguishable from menu bar**

  Verified in `ui-src/src/routes/index.tsx`. The install panel now uses a distinct white window body, subtle chrome, border, and layered shadow against the dark get-started section so the card reads as a separate installer/terminal surface.

- [x] **[BLOCKER — v1.0.0] "Buy Me a Coffee" button looks out of place next to "View on GitHub"**

  Verified in `ui-src/src/routes/index.tsx`. The GitHub and coffee links now share the same outline button treatment, radius, typography, spacing, and hover behavior, with a custom inline coffee icon instead of an embedded third-party badge.

- [x] **Increase nav and footer text contrast** — verified in `ui-src/src/routes/index.tsx`. Nav links use stronger foreground contrast, and footer links/body copy are readable against the dark footer gradient with brighter hover states.

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

## User Preferences

- [ ] **Server-side preferences store — replace localStorage with DB persistence**

  Currently, UI preferences (selected voice, tone, format, quality, advanced sliders, favorites) are stored in `localStorage`. This works for a single browser but is lost if the user clears browser data, switches browsers, or accesses Vox from a different device on the same network.

  **Proposed approach:**
  - Add a `user_preferences` table to SQLite:
    ```sql
    CREATE TABLE user_preferences (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,         -- JSON-encoded
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ```
  - Add `GET /preferences` (returns all key-value pairs as a JSON object) and `PATCH /preferences` (upserts one or more keys).
  - On app load, fetch preferences from the server and hydrate the UI state instead of reading from localStorage.
  - On any preference change, debounce and `PATCH /preferences` to persist server-side.
  - Keep localStorage as a write-through cache so the UI feels instant (no round-trip on load if cache is fresh).

  **Keys to persist server-side:**
  - `voiceId` — selected voice profile
  - `tone` — selected tone / style preset
  - `format` — mp3 or wav
  - `mp3Quality` — selected MP3 bitrate
  - `wavQuality` — selected WAV bit depth
  - `advanced` — all 6 slider values
  - `favorites` — array of starred voice profile names

  **Why:** a single-user local app doesn't need multi-user sessions, but server-side persistence means preferences survive browser resets and work consistently across Safari, Chrome, or any other browser pointed at the local server. Also a prerequisite for any future multi-device or remote access scenario.

---

## Maintenance & Memory

- [ ] **Soft-delete voice profiles — trash folder with 72h recovery window**

  When a voice profile is deleted via `DELETE /voices/{name}`, instead of permanently removing the WAV file, move it to a `voices/deleted/` folder alongside a metadata sidecar so it can be restored if needed.

  **Soft-delete behavior (`DELETE /voices/{name}`):**
  - Move `voices/{filename}.wav` → `voices/deleted/{filename}.wav`
  - Write a sidecar `voices/deleted/{filename}.json` with: `{ "name", "description", "tags", "deleted_at", "original_filename" }` so the profile can be fully restored
  - Mark the DB row `status='deleted'` and set `deleted_at=datetime('now')` instead of hard-deleting it — keeps job history intact

  **Routine cleanup task (extend existing `cleanup.py`):**
  - The existing `run_cleanup_loop()` already runs on a TTL schedule — extend it rather than adding a second timer
  - Add a pass that scans `voices/deleted/` and permanently removes any file whose sidecar `deleted_at` is older than `VOX_DELETED_VOICE_TTL_HOURS` (default 72)
  - After purging the file, hard-delete the DB row and the sidecar
  - Log each purge at INFO level with the voice name and age

  **Future `POST /voices/{name}/restore` endpoint (optional, later):**
  - Move WAV back to `voices/`, re-activate the DB row, remove the sidecar
  - Surface in UI as an "Undo delete" option within the 72h window

  **Config:**
  - `VOX_DELETED_VOICE_TTL_HOURS` — default `72`, `0` = never auto-purge

  **Why:** Accidental deletes are hard to recover from today. A trash folder with a daily cleanup is a low-cost safety net that matches how macOS Trash works. Extending the existing cleanup loop keeps the scheduled-task surface minimal.

- [ ] **Prune old job rows from SQLite** — cleanup task deletes output files but DB rows accumulate forever. Add `DELETE FROM jobs WHERE created_at < datetime('now', '-30 days')` to the cleanup loop, configurable via `VOX_JOB_RETENTION_DAYS` (default 30).

---

## Installer UX

- [x] **Interactive installer — unify setup.sh into a single guided script**

  Implemented as `vox.sh`, the unified installer/updater/uninstaller entry point. It presents an interactive menu when run without a command and supports direct commands for scripted use:

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

  Existing individual scripts (`install-agent.sh`, `install-helper.sh`, `update.sh`, etc.) remain usable for lower-level troubleshooting.

- [ ] **Unify uninstall scripts into a single `uninstall.sh`**
  - Merge `uninstall-agent.sh` and `uninstall-helper.sh` into one `scripts/uninstall.sh` with an interactive prompt to choose what to remove.
  - Support flags for non-interactive/CI use:
    - `--all` — remove everything (agent + helper + app bundle)
    - `--agent` — remove server agent only
    - `--helper` — remove helper + app bundle only
    - `--data` — also remove voices, outputs, data, input from Application Support (destructive, off by default)
    - `--yes` — skip all confirmation prompts

- [ ] **Install script should surface Chatterbox model download/load progress instead of silently returning**

  On first install, after `setup.sh` completes and the LaunchAgent starts, the Chatterbox model must be downloaded from Hugging Face (can be several GB) and loaded into memory before the server is actually ready. Currently the script prints "Done" and releases the terminal immediately — users see a prompt again and may navigate to `localhost:8000` or open the app, get connection errors or a spinner, and assume the install failed.

  **Three approaches to consider (not mutually exclusive):**

  **Option A — Tail logs and wait in the install script**
  - After starting the LaunchAgent, poll the server log (`~/Library/Logs/Vox/vox.log`) until a "Model loaded" or "Application startup complete" line appears (or a timeout, e.g. 10 min).
  - Print live progress lines to the terminal while waiting: `[vox] Waiting for model to load… (this may take a few minutes on first run)`.
  - Once ready, print `[vox] ✓ Server is ready — open http://localhost:8000` and exit.
  - If timeout is reached, print a clear message explaining the model may still be downloading and how to check logs.

  **Option B — Print a clear warning and release immediately**
  - Simpler: after starting the agent, print a prominent notice:
    ```
    ⚠️  First-run model download in progress.
        The Chatterbox model will download in the background (may take a few minutes).
        The app will show a loading state until it's ready.
        To check progress: open VoxHelper from the menu bar → View Logs
    ```
  - No polling, no blocking — just sets the right expectation upfront.

  **Option C — Helper tracks and displays model download/load progress (best long-term)**
  - The VoxHelper menu bar app polls `GET /health` or a new `GET /status` endpoint that returns a `model_state` field: `"downloading"` / `"loading"` / `"ready"` / `"error"`.
  - While the model is not ready, the helper icon shows a spinner or distinct state (e.g. gray icon vs. green) and the menu shows "Model loading… 42%" or "Downloading model (1.2 GB / 3.4 GB)".
  - Once `model_state == "ready"`, icon turns green and a macOS notification fires: "Vox is ready."
  - This is the most user-friendly path — no terminal watching required, and it works both on first install and after a restart.
  - Requires the backend to expose download/load state, which could be tracked via a module-level variable updated during `load_model()` in `api/core/engine.py`.

  **Recommended approach:** implement Option B immediately (low effort, fixes the confusion now) and backlog Option C as the premium experience for v1.0.0.

- [x] **Add `--yes` flag to skip interactive prompts during clean install**

  Implemented on the supported entry point: `bash vox.sh install --yes`. This accepts defaults, skips prompts, and can be paired with `--token hf_xxx` for non-interactive installs.

  **Prompts to auto-accept with `-y`:**
  - First, audit `setup.sh` to enumerate every `read`/`select` prompt currently present — the exact list needs to be confirmed against the current script.
  - Likely candidates: install server LaunchAgent? [Y/n], install menu bar helper? [Y/n], HF token prompt (skip / leave blank by default), any overwrite/reinstall confirmations.

  **Implementation:** check whether a simple `yes |` pipe (`yes | bash setup.sh`) already works, or whether prompts need explicit `-y` branching. Some `read` calls with `-r` may not respond to piped input correctly — if so, add a `YES=false` flag at the top of the script and wrap each prompt: `if $YES; then ANSWER=y; else read ...`.

  **Also apply to:** `install-agent.sh`, `install-helper.sh` — any script that is called from `setup.sh` and adds its own prompts should accept a passed-through `-y` flag.

- [ ] **Add remaining CLI flags to update workflows for scripted/development use**
  `vox.sh` already supports `--yes`, `--token`, `--agent-only`, `--helper-only`, `--purge`, `--zip`, `--devbranch`, and `--branch`. Remaining update-specific ideas:
  - `update.sh` / `vox.sh update` flags:
    - `--no-restart` — sync files and deps but do not restart agents (useful mid-session)
    - `--agent-only` / `--helper-only` — reinstall only one agent
  - These make CI pipelines, automated testing, and power-user workflows easier without disturbing active long-running generations.

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

- [ ] **[PRE-RELEASE BLOCKER] Unified release workflow — eliminate version number discrepancies before v1.0.0**

  Version numbers currently live in at least five separate places and must be updated manually on every release. Missing any one of them causes the footer or build artifacts to show a stale version (e.g. footer showed `0.4.0` when tagging `v0.4.2-beta`):
  - `api/main.py:341` — `"vox_version"` string returned by `GET /api/v1/settings` (what the app footer reads)
  - `scripts/build-apps.sh` — `CFBundleShortVersionString` for VoxHelper.app and VoxServer.app
  - `CHANGELOG.md` — version header for the new release section
  - Git tag on `main` / `development`
  - (future) landing page, `/health` response, installer banner

  **Goal:** single source of truth. Options:
  - A `VERSION` file at repo root that `build-apps.sh`, the landing page build step, and the API all read from.
  - Or a release script (`scripts/release.sh`) that takes the version as an argument, updates all five locations atomically, commits, tags, and pushes — so a release is one command with no manual file editing.

  **Preferred approach:** a top-level `vox.yaml` (or `vox.config.yaml`) that is the single source of truth for version and other project-wide constants (bundle IDs, team ID, minimum OS versions, default port, app name, etc.). Every script, build step, and the API reads from this file — nothing hardcodes these values inline. A release is then: edit `version` in `vox.yaml` → run `bash scripts/release.sh` → done.

  Whichever approach, the release checklist should be: update `vox.yaml` → build DMG/package → notarize → push tag → upload package to GitHub Releases → update the landing page package filename, download URL, size, and SHA256 checksum. No hunting for hardcoded strings.

- [ ] **Track installed version and prevent redundant installs/updates**
  - Write the current git SHA (or version tag) to `~/Library/Application Support/Vox/version` at the end of install and update.
  - On `vox.sh install`: if a version file exists, compare against the current source — warn if already on the same version and ask to reinstall or skip.
  - On `vox.sh update`: compare installed version against latest available (git `HEAD` for clones, or a `version` file in the source folder for zip updates) — if already up to date, print "Already on latest version (abc1234)" and exit cleanly without restarting agents.
  - On `vox.sh` interactive menu: display the currently installed version.
  - For zip-based installs where there's no git: include a `version` file in the zip at build time so the comparison still works.

---

## Installation & Diagnostics

- [x] **Write install log to `~/Library/Logs/Vox/install.log`**
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

- [x] **[DONE] Version API endpoints under `/api/v1/`**

  All product routes are now served under `/api/v1/` prefix (`/api/v1/tts`, `/api/v1/voices`, `/api/v1/jobs`, `/api/v1/presets`, `/api/v1/stats`, `/api/v1/settings`). The unversioned `/health` endpoint remains at the root as a shallow liveness check. Frontend `api.ts` updated to match. Landing page code snippets updated. README API reference updated.

- [ ] Streaming audio response (chunked transfer encoding)
- [ ] **Generation queue with richer UI feedback** — replace single `asyncio.Lock` with a proper worker queue.
  - Backend: queue incoming requests when a generation is already in progress instead of letting overlapping jobs stack up; return a job ID immediately with `202 Accepted` and expose `GET /jobs/{id}/status` for polling or SSE.
  - Current state: requests are accepted immediately as `queued`, serialized by a single local model lock, and the UI shows queued/running states in both the global top bar and Create result panel.
  - Remaining UI: expose actual queue position ("Queued — position 2") once the backend tracks queue depth/order explicitly.
  - Remaining UI: consider a compact queue-status widget that shows `Queued`, `Running`, and `Next up` states plus current position.
  - Pair with the sidebar stats item below so queue depth can live alongside session metrics.
  - Recovery: if the app restarts while a job is in flight, reconcile the persisted job state on startup so the UI does not show duplicate or orphaned runs.
- [x] **Kill switch for in-flight jobs** — add an explicit way to stop work that is already running.
  Implemented with `POST /api/v1/tts/{request_id}/cancel`, active-task tracking, cancelled job status, Create-page cancel control, and global cancel control. Stale queued/processing jobs from agent restarts are marked failed on startup so the UI does not show orphaned runs.
- [ ] **Sidebar stats panel** — use the empty space in the left navigation bar to surface live server stats.
  - Candidates: requests processed (session + all-time), audio minutes generated (session + all-time), current queue depth, average generation time.
  - Pull from existing SQLite job history for all-time counts; track session counts in memory.
  - Update on each completed job — no polling needed if driven by the same SSE stream as queue feedback.
  - Display as a compact, non-interactive stats block near the bottom of the nav sidebar, and reserve one slot for queue state if the widget idea lands first.
- [ ] Server-sent events for real-time generation progress

---

## Connectivity & Network Access

- [x] **Network Access Mode — local-only vs LAN access**

  Implemented as Settings → Runtime → Network access.

  **Modes:**
  - **Local only:** writes `VOX_HOST=127.0.0.1`; Vox only listens on the Mac running it.
  - **Network accessible:** writes `VOX_HOST=0.0.0.0`; Vox listens on all interfaces so devices on the same LAN can connect.

  **UX:**
  - Host changes write to `.env`.
  - The active server process keeps its current host until restart.
  - Settings shows active host, saved-after-restart host, and a small "Requires restarting local server" badge when they differ.
