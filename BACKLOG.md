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

- [ ] **[BLOCKER — v1.0.0] Git not installed — macOS prompts to install Developer Tools and terminal command fails**

  On a fresh macOS machine without Xcode Command Line Tools, running any `git` command (including `bash vox.sh install` or `bash vox.sh update`) triggers a system dialog: *"The git command requires the command line developer tools. Would you like to install the tools now?"*. The terminal command hangs waiting for the dialog, and if the user dismisses it, the install fails with a confusing error.

  **Who hits this:** any new user on a stock macOS machine who has never installed Xcode or the CLT package. More common than expected — macOS ships without git since Catalina.

  **Options to consider:**
  - **Check for git before running** — add a guard near the top of `setup.sh` / `vox.sh` that runs `command -v git` and exits with a clear human-readable message if not found, rather than letting macOS intercept the call with a confusing dialog.
  - **Trigger CLT install explicitly** — `xcode-select --install` launches the same dialog intentionally, and the script can wait for it to complete (`xcode-select -p` exits 0 once done). This lets the installer handle git as a dependency rather than asking the user to do it separately.
  - **Document in README / FAQ** — at minimum, note the prerequisite and link to the one-liner (`xcode-select --install`) before the install steps.
  - **`.pkg` installer path** — if the v1.0.0 `.pkg` installer handles setup, it can bundle or pre-check this dependency at install time, bypassing the terminal issue entirely.

  **Recommended short-term fix:** add a `command -v git || { echo "[vox] git is required. Run: xcode-select --install"; exit 1; }` guard in `setup.sh` and `vox.sh` so the user gets a clear message instead of a hanging dialog.

  **Longer term:** FAQ entry and/or handle it inside the `.pkg` installer flow.

- [ ] **[BLOCKER — v1.0.0] Real audio waveform visualisation**

  All waveforms in the app (voice profile cards, upload preview, record pane, generate result) are currently fake: static sine-wave bars computed from a fixed formula with no relation to the actual audio signal. They look dead and unconvincing. This must be replaced before v1.0.0 ships.

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

  **Why a blocker:** the fake waves actively undermine trust in the output quality. Users expect to see their voice reflected in the waveform before committing to "Use" a profile or downloading a clip.

- [ ] **[LOW] Migrate existing user preset names to lowercase in DB**

  Preset names are now normalized to lowercase at save time (both frontend and backend). Any presets saved before this change may still have mixed-case names in `user_presets.name`, which could cause duplicate chips or mismatched tone selection.

  **Fix:** run a one-time migration `UPDATE user_presets SET name = lower(name)` and handle any conflicts (keep the most recently created row if two names collide after lowercasing). This can be added to the additive migrations loop in `api/core/db.py` — but since it's destructive (data change, not schema change), it needs a version guard to only run once (e.g. check a `meta` table or use a flag column).

  **Priority:** low — only affects users who saved presets before the normalization fix landed.

- [ ] **[MEDIUM] Custom tone edit flow — "Update" vs "Save As" split action**

  When a user is on a custom tone and has tweaked the sliders, there is currently only a "Save Preset" button that always creates a new preset. This forces duplication when the user just wants to update their existing custom tone in place. The flow needs two distinct exit paths:

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

- [ ] **[LOW] Replace timer on "Processing Script…" button with a progress bar or percentage**

  The Generate button cycles through states: `Generate Voice` → `Processing Script…` → result. While processing, the button currently shows an elapsed timer (e.g. "Processing Script… 0:12"). The elapsed time is redundant — the Result pane already shows a timer. The button real estate is better used to show how far along the generation actually is.

  **Proposed behaviour:**
  - Remove the elapsed clock from the button label entirely.
  - Replace it with either a progress bar filling the button background left-to-right, or a percentage readout (e.g. "Processing… 34%").
  - Progress should be derived from real server data. Two options:
    1. **Chunk-based estimate** — the API already knows `chunks` (total chunks in the script). If the backend emits per-chunk completion events via SSE (`GET /jobs/{id}/stream`), the frontend can show `chunks_done / total_chunks * 100`. This is the most accurate approach and pairs with the SSE backlog item.
    2. **Elapsed-time heuristic** — use the average RTF from recent jobs in the DB to estimate total duration, then advance a progress bar based on elapsed time. Simpler but less accurate; bar could stall or overshoot.
  - Option 1 is preferred but requires the SSE work to land first. Until then, option 2 is a usable interim.
  - The button text while processing should just read `Processing…` (no clock, no percentage if using the bar variant).

  **Files to touch:** `ui-src/src/routes/app.index.tsx` — the generate button state machine and its label/style logic.

- [ ] **[LOW] Recent scripts history — quick re-use from script box**

  When a user generates a clip, save the script text to a capped local history so they can pull it back up without retyping. A clock/history icon in the script box header opens a small dropdown showing the last N scripts (truncated to one line each), clicking one populates the textarea.

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

- [ ] **[HIGH] Rethink error display — replace ephemeral toast with persistent, actionable error UI**

  The current error toast (bottom-left, disappears after a few seconds) is inadequate for generation failures. A 4-minute job that silently fails with a toast the user may not even see is a bad experience. Errors need to be visible, readable, and persistent until the user dismisses them.

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

  **Keep the toast for non-critical feedback only** (copy success, voice uploaded, settings saved). Errors from API calls — generation, voice upload failures, network errors — should all use the persistent inline card pattern.

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
  - Distinct `no-device` vs `denied` states with tailored error UI and "Try again" buttons.
  - Device selector dropdown when multiple mics available (`enumerateDevices()` after permission grant).
  - Implemented in `ui-src/src/routes/app.voices.tsx` RecordPane.


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

## Update Script

- [ ] **Skip app reinstall when VoxServer and VoxHelper are already current**

  `vox.sh update` always reinstalls both LaunchAgents unconditionally, even when the DMG hasn't changed and the installed apps are identical. This means every `update` triggers a full stop→copy→reload cycle for both agents regardless of whether the Swift binaries changed — wasteful and causes an unnecessary server restart.

  **Detection approach:**
  - Read the installed app's version from its `Info.plist`:
    ```bash
    installed=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" \
      /Applications/VoxHelper.app/Contents/Info.plist 2>/dev/null)
    bundled=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" \
      "$MOUNT_POINT/VoxHelper.app/Contents/Info.plist" 2>/dev/null)
    ```
  - Compare `$installed` vs `$bundled` (version string from `build-apps.sh`). If equal → skip reinstall for that app.
  - Do the same comparison for `VoxServer.app` (installed at `~/Library/Application Support/Vox/VoxServer.app`).
  - Each app is checked and skipped independently — helper may be current while server needs update.

  **What gets skipped when app version is unchanged:**
  - `cp -r` of the app bundle from DMG
  - `launchctl unload` + `launchctl load` of the LaunchAgent plist

  **What always runs regardless:**
  - `git pull` (already conditional on diff)
  - Python dependency sync (`pip install -r requirements.txt`)
  - API/UI code sync to Application Support

  **Important — LaunchAgent reload vs server restart are separate concerns:**
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

  **Blocked by:** version bump workflow — `CFBundleShortVersionString` in `build-apps.sh` must be kept in sync with the git tag. Covered by the vox.yaml unified version tracking backlog item.

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

- [ ] **[BLOCKER — v1.0.0] Install window background indistinguishable from menu bar**

  The terminal/install window mockup on the landing page uses the same (or very similar) background color as the simulated macOS menu bar above it, making the two regions blend together. The window content area needs to read as a distinct, lighter surface so the mockup clearly communicates "this is a terminal window inside a menu bar screenshot."

  **Fix:** lighten the window body background — e.g. `#1e1e1e` or similar dark-but-distinct value versus the menu bar's near-black — so there's visible depth separation. A subtle border or drop shadow between the two zones may also help. Verify on both light and dark OS themes if the mockup is static.

  File: `ui-src/src/routes/index.tsx` (landing page install section).

- [ ] **[BLOCKER — v1.0.0] "Buy Me a Coffee" button looks out of place next to "View on GitHub"**

  The two CTA buttons sit side by side on the landing page, but "Buy Me a Coffee" is visually inconsistent with the polished "View on GitHub" button — different weight, color treatment, or style signals "third-party widget" rather than a cohesive design. On a v1.0.0 landing page this reads as unfinished.

  **Options to consider:**
  - Restyle the coffee button to match the GitHub button's border, radius, font weight, and icon treatment — same visual language, different icon (e.g. a coffee cup from lucide or a custom SVG) and label.
  - Use a plain `<a>` link styled as a secondary outline button that links to the Buy Me a Coffee URL instead of embedding their widget/badge.
  - Reconsider placement — if the two buttons are meant to have different visual weight (GitHub = primary, coffee = secondary), make that hierarchy intentional rather than accidental.

  File: `ui-src/src/routes/index.tsx` (landing page hero / CTA section).

- [ ] **Increase nav and footer text contrast** — the landing page nav links and footer copy are too light on some screens. Target WCAG AA contrast ratio (4.5:1) against the page background. Fix in `ui-src/src/routes/index.tsx` (landing page) using Tailwind opacity utilities or updated colour values.

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

- [ ] **Unified release workflow — eliminate version number discrepancies before v1.0.0**

  Currently version numbers live in at least five separate places and must be updated manually:
  - `scripts/build-apps.sh` — `CFBundleShortVersionString` for VoxHelper.app (×1) and VoxServer.app (×1)
  - `api/main.py` — `vox_version` string in `GET /settings` (already dynamic, just needs single-source-of-truth)
  - `api/main.py` — if a `/health` or `/version` endpoint is added, it should report the same version
  - `CHANGELOG.md` — version header
  - Git tag on `main`

  **Goal:** single source of truth. Options:
  - A `VERSION` file at repo root that `build-apps.sh`, the landing page build step, and the API all read from.
  - Or a release script (`scripts/release.sh`) that takes the version as an argument, updates all five locations atomically, commits, tags, and pushes — so a release is one command with no manual file editing.

  **Preferred approach:** a top-level `vox.yaml` (or `vox.config.yaml`) that is the single source of truth for version and other project-wide constants (bundle IDs, team ID, minimum OS versions, default port, app name, etc.). Every script, build step, and the API reads from this file — nothing hardcodes these values inline. A release is then: edit `version` in `vox.yaml` → run `bash scripts/release.sh` → done.

  Whichever approach, the release checklist should be: update `vox.yaml` → build DMG → notarize → push tag. No hunting for hardcoded strings.

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

- [ ] **[HIGH — PRE-v1.0] Version API endpoints under `/v1/`**

  All routes currently live at the root (`/tts`, `/voices`, `/jobs`, `/presets`, `/stats`). Moving them to `/v1/` before the first public release makes the API future-proof: a `/v2/` can introduce breaking changes while `/v1/` stays stable and supported, and users never need to rewrite working integrations.

  **What to do:**
  - Add `prefix="/v1"` to every router in `api/main.py` (`tts`, `voices`, `jobs`, `presets`) and move the `/health`, `/settings`, and `/stats` inline routes into a versioned router.
  - Keep unversioned `/health` as a shallow liveness check (no version prefix needed — it's infrastructure, not product API).
  - Update `ui-src/src/lib/api.ts` — all `apiFetch` paths to use `/v1/...`.
  - Update the OpenAPI `servers` block in `main.py` and any hardcoded paths in scripts or docs.
  - Update the landing page code snippets (`API_SNIPPETS` in `index.tsx`) to show `/v1/` URLs.

  **Why to do it now (not later):** versioning is a one-time breaking change. Every integration built against the current unversioned paths will break the moment we add the prefix. The longer we wait, the more users have to update. Doing it before any external integrations exist costs nothing.

  **Do this before the first public/shared release. It is a breaking change if deferred.**

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

---

## Connectivity & Offline Mode

- [ ] **Verify and implement offline mode — auto-fallback to localhost when remote is unreachable**

  When Cloudflare tunnel access is configured, the app should detect network connectivity and automatically fall back to `http://localhost:8000` when the remote URL is unreachable, then switch back when it comes online.

  **Expected behavior:**
  - **Online:** use the configured remote URL (e.g. Cloudflare tunnel domain)
  - **Offline / tunnel unreachable:** silently fall back to `http://localhost:8000`
  - **Recovery:** when connectivity is restored, revert to the remote URL automatically (no page reload required)

  **Where the URL lives today:** `apiFetch` in `ui-src/src/lib/api.ts` resolves relative to `window.location.origin`, which works when the user is already on the right host. If the remote URL is ever stored in settings or localStorage, that needs to feed into the resolution logic.

  **Proposed detection approach:**
  - On app init (and periodically, e.g. every 30 s), issue a lightweight `GET /health` against the current base URL with a short timeout (~3 s).
  - If it fails and the current base URL is the remote URL, retry against `http://localhost:8000/health`.
  - If localhost responds, flip `baseUrl` to localhost and show a subtle "Local mode" badge in the UI.
  - Use `navigator.onLine` as a fast pre-check to avoid the round-trip when the device is clearly offline.

  **UI indication:**
  - Small badge or status dot in the nav sidebar showing "Local" vs "Remote" (similar to how the menu bar helper might show this).
  - No modal or blocking UI — just a passive indicator.

  **Config questions to resolve before implementing:**
  - Where is the remote tunnel URL stored? (Currently seems implicit from how the page is served.) If the user accesses via the tunnel, `window.location.origin` already is the remote URL — no config needed. But if they bookmark the tunnel URL and open the app while offline, the SPA itself may not load. Clarify: is offline mode purely about API connectivity once the SPA is loaded, or about the page load too?
  - If it's the latter, a service worker or a cached index.html served locally would be needed — more complex.

  **Priority:** LOW — the app is primarily accessed locally; tunnel access is a convenience feature. Implement after v1.0 unless the tunnel becomes a primary access pattern.
