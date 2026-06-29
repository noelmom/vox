# Backlog

Ideas and improvements to revisit. Not bugs — these are enhancements queued for later.

## v1.0 Scope Freeze

Until v1.0 ships, avoid adding new product features. Pre-v1 work should be limited to bug fixes, polish, documentation accuracy, release hardening, and true blockers. Feature ideas below are post-v1 unless explicitly reclassified as blockers.

## Stability Findings

- [x] **Do not use PyTorch MPS memory-fraction controls for v1**
  - Finding: `VOX_MPS_MEMORY_FRACTION` / `torch.mps.set_per_process_memory_fraction(...)` caused repeatable `MPS backend out of memory` regressions after being added, even at `1.0`.
  - Stable behavior: leaving PyTorch MPS allocator behavior alone allowed long scripts to complete reliably again.
  - Decision: remove the Settings control, `.env` option, API fields, and model-loader hook. Do not reintroduce this before v1. Any future revisit needs a controlled test matrix across clean restart, repeated generations, short/medium/long scripts, and multiple Apple Silicon memory sizes.

---

## Post-v1 Feature Ideas

- [ ] **Manual pause insertion in Create**
  - Add a real `Insert Pause` flow for the script editor.
  - Suggested approach: insert a lightweight token at the cursor such as `[pause:0.5s]`, parse it before chunking, and translate it into explicit silence between generated text spans.
  - Needs script validation, readable UI chips/markup, and backend parser support. Do not ship before v1.0 unless it becomes a blocker.
  - Product decision: after v1.0.

- [ ] **Pronunciation dictionary / word replacement controls**
  - Add a real `Add Pronunciation` flow for words, names, acronyms, and brand terms.
  - Suggested approach: store pronunciation aliases in SQLite, apply replacements before TTS generation, and expose per-script or global rules in the Create UI.
  - Needs careful UX so users understand this is text normalization, not true phoneme-level model control. Post-v1 only.
  - Product decision: after v1.0.

- [ ] **Remote URL audio import for voice profiles**
  - Let users create a voice profile from an audio URL, then trim it in the existing upload/trim flow.
  - Product decision: after v1.0.

- [ ] **Non-verbal speech cue support**
  - Explore whether profile-bound cue audio splicing or text normalization can support laughs, breaths, sighs, and other non-verbal moments.
  - Product decision: after v1.0.

---

## Quality & Testing Strategy

- [x] **Decide on testing stack and enforce it in CI**

  Baseline implemented with GitHub Actions in `.github/workflows/ci.yml`, dev dependencies in `requirements-dev.txt`, shared config in `pyproject.toml`, and focused tests under `tests/`.

  **Unit tests (backend)**
  - Selected: `pytest` + `pytest-asyncio`.
  - Current coverage focuses on build identity, text chunking, request IDs, and OpenAPI schema registration.
  - Future: mock the Chatterbox model with a fixture that returns a dummy WAV, then cover `POST /tts` and voice CRUD.

  **Integration / end-to-end tests**
  - Future: spin up the full FastAPI app with `httpx.AsyncClient` + `ASGITransport` — no network needed.
  - Future key flows: `POST /tts` happy path, bad voice file, missing text, history pagination, voice CRUD.
  - Web UI e2e decision remains deferred; Playwright is still the best fit when we add browser-level checks.

  **Linting & formatting**
  - Backend: `ruff` currently enforces correctness-oriented `F` rules.
  - Frontend: CI runs `tsc --noEmit` and production Vite build.
  - Shell scripts: CI runs `bash -n` syntax checks against `vox.sh`, `setup.sh`, `scripts/*.sh`, and `pkg-scripts/*`.
  - Future: broaden Ruff style rules, add frontend ESLint/Prettier, and introduce ShellCheck as a dedicated cleanup pass.

  **Pre-commit hooks**
  - Future: add `pre-commit` hooks for Ruff, typecheck/build smoke checks, shell syntax, and a secret scanner such as `detect-secrets`.

  **CI pipeline**
  - GitHub Actions runs on pushes and pull requests targeting `main` and `development`.
  - Jobs: backend Ruff + pytest, frontend typecheck + build, shell syntax.

---

## Logging & Observability

- [x] **Capture User-Agent in logs and DB**
  - Implemented as nullable `jobs.user_agent`, populated from the `User-Agent` header when a TTS job is submitted.
  - Exposed through job responses and `/api/v1/logs` query results.

- [x] **`GET /logs` endpoint**
  - Implemented as `GET /api/v1/logs`.
  - Returns structured job/log history from SQLite, not raw log-file text.
  - Supports filters for `request_id`, `status`, `date_from`, `date_to`, `preset`, `voice`, and `user_agent`.

- [x] **Raw log-file viewer endpoint**
  - Implemented as `GET /api/v1/logs/files/{name}`.
  - Returns bounded, read-only tails from predefined Vox log names only: `server`, `server-error`, `helper`, `helper-error`, and `install`.
  - Kept separate from `GET /api/v1/logs`, which returns structured job history from SQLite.

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

- [x] **[LOW] Migrate existing user preset names to lowercase in DB**
  - Implemented via one-time `meta` migration `normalize_user_presets_lowercase` in `api/core/db.py`.
  - Keeps the newest row if multiple historical names collide after lowercasing.

  Original note:

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

  Implemented in `ui-src/src/routes/app.index.tsx` and `ui-src/src/routes/app.tsx`. The Generate button stays focused on submission state, while queued/running state is shown in the Create result panel and compact global status bar with elapsed time and cancel controls. This avoids overcrowding the button while still giving users visible status during long generations.

  Explicit queue position and chunk-progress fields were removed from the v1 baseline after stability testing showed the simpler serialized generation path was more reliable.

- [x] **[MEDIUM] Server-sent events for generation progress**

  Implemented as `GET /api/v1/jobs/{request_id}/events` in `api/routers/jobs.py`. The Create page subscribes with `EventSource` and keeps a slower 5-second polling loop as a fallback. Job events use the same shape as `GET /api/v1/jobs/{request_id}`.

- [x] **[MEDIUM] Backup and restore**

  Implemented in `api/routers/backups.py` and Settings. `GET /api/v1/backups/export` downloads a zip containing `data/vox.db` plus `voices/`; generated output audio is intentionally excluded. `POST /api/v1/backups/restore` validates the zip, replaces the DB and voice assets, reconnects SQLite, and prompts the user to refresh Studio.

- [x] **[LOW] Recent scripts history — quick reuse from script box**

  Implemented in `ui-src/src/routes/app.index.tsx`. Generated scripts are saved to `localStorage["vox:script-history"]`, capped at 10 entries, deduped newest-first, and exposed from the script box history dropdown.

  **Implementation notes:**
  - Store as a JSON array in `localStorage["vox:script-history"]`, capped at 10 entries (newest first). Trim duplicates before pushing.
  - Save to history at the moment the Generate button is pressed (inside the existing `handleGenerate` function in `app.index.tsx`).
  - The trigger button sits in the script box toolbar where the Clock icon was removed; restore the icon + button and wire up a `DropdownMenu` from `@/components/ui/dropdown-menu`.
  - Each dropdown item shows the first ~80 chars of the script followed by an ellipsis if truncated.
  - Limit is 10 entries for now; make it configurable via Settings later (low priority).

- [ ] **[LOW] Top-bar header actions — after v1.0**

  Three buttons were removed from the top-right of the app header (`app.tsx`) pending future implementation. Theme selection was removed from the v1 UI while dark-mode polish is deferred; re-add appearance controls when the theme is release-ready. All used `lucide-react` icons and the `IconBtn` helper component (also removed — trivial to restore).

  1. **Theme preference** — v1 forces `light` in `ui-src/src/routes/app.tsx` and `ui-src/src/routes/app.settings.tsx`. The existing dark tokens and `vox-*` theme primitives remain in place for post-v1 polish, but `system` and `dark` are not user-selectable before v1.0.

  2. **Notifications bell** (`Bell` icon) — silence/unmute in-app alerts. Intended to pair with a future alert system that notifies when a generation completes or errors. Backend already has an `/alerts` router stub. Suggested key: `vox:notifications` in localStorage.

  3. **User profile / account** (`ChevronDown` + avatar initials) — not needed for local single-user deployment but useful if multi-user or cloud sync is ever added. Low priority. Would need an auth layer.

  Product decision: theme preference, notifications bell, and profile/account controls are after v1.0.

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

- [x] **System alert banner framework**
  - Backend implemented as `GET /api/v1/alerts`.
  - Frontend app shell polls alerts every 5 minutes and renders persistent dismissible banners below the global generation status bar.
  - Dismissals are stored in `sessionStorage` by alert id.
  - Initial checks: low disk space, missing/non-executable ffmpeg, output directory not writable.

  Original proposal:

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

- [x] **Version number and support link in helper menu**
  - Helper menu shows separate Studio and Helper build labels from `build_info.json` / bundle metadata.
  - Added `Visit Support Page`, pointing to `https://noelmom.github.io`.

- [x] **Uninstall Vox from helper menu**
  - Implemented in `voxhelper/StatusBarController.swift`.
  - Adds `Uninstall Vox…` with a native confirmation dialog.
  - Runs the normal `vox.sh uninstall --yes` flow in Terminal so progress and any macOS admin prompt are visible.
  - Keeps voices, recordings, settings, and data by default; destructive purge remains CLI-only.

- [x] **"Check for Updates" menu item**
  - Helper menu adds `Check for Updates…`, opens the update flow in Terminal so output/errors are visible, and temporarily disables the menu item while launching.
  - `vox.sh update` and `scripts/update.sh` now skip redundant work when the installed source build matches the desired build.

- [x] **Update `setup.sh` post-install instructions** — now prints the correct install-agent → install-helper → start flow. Also creates `~/Library/LaunchAgents` and `~/Library/Logs/Vox` so install scripts never fail on a clean macOS install.

- [x] **Restart transition state — "Restarting…"**
  - Implemented in `voxhelper/StatusBarController.swift`.
  - Clicking Restart immediately shows `Restarting…` for up to 15 seconds while launchd cycles the server, then clears once the health check is healthy again or the window expires.

  Original proposal:
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

- [x] **App Background Activity branding in System Settings**
  - Both LaunchAgents currently appear under "Noelmo Melo" (the Developer ID name) with no custom icon in System Settings → General → Login Items & Extensions → App Background Activity.
  - Two sub-issues to resolve:
    1. **Icon** — `VoxHelper.app` and `VoxServer.app` bundles have valid `CFBundleIconFile` entries backed by `assets/VoxHelper.icns` and `assets/VoxServer.icns`. Verify whether macOS System Settings picks those up in the Login Items UI; macOS may still group the background activity under the Developer ID label.
    2. **Developer label** — the grouping label comes from the Developer ID certificate name ("Noelmo Melo"). Options to make it more brand-friendly: register a company/org name with Apple (e.g. "MeloLabDev") and reissue the cert under that name, or use a vanity domain like `noelmom.github.io` or `melolabdev.com` as the org identifier. Decide on permanent brand name before reissuing — cert changes require re-signing and re-notarizing all apps.
  - Product decision: keep the Developer ID label as "Noelmo Melo" for v1.0.

- [x] **Replace temporary app icons before public release**
  - Replaced the legacy `assets/Vox.icns` placeholder with separate final-style app icons: `assets/VoxHelper.icns` and `assets/VoxServer.icns`.
  - `scripts/build-apps.sh` writes matching `CFBundleIconFile` values for each app bundle.
  - The old shared `assets/Vox.icns` file has been removed.

- [x] **Auto-launch on login (server)** — server `RunAtLoad` now defaults to `<true/>` in the LaunchAgent template and installer-generated plist. Users can disable server auto-start from the Vox Helper menu.

- [x] **Login item toggles in the helper menu**

  Implemented as checkable `NSMenuItem`s in the helper menu.

  **Behavior:** toggling only changes whether the agent auto-starts at next login — the currently running process is unaffected. No warning dialog needed; the toggle is reversible and self-explanatory.

  **Implementation (all in `StatusBarController.swift`):**
  - Two new menu items with `.state` (`.on`/`.off`) for the checkmark
  - **Read state:** `NSDictionary(contentsOfFile: plistPath)` → read `RunAtLoad` bool → set checkmark on menu open (or on `apply()` each poll cycle)
  - **Toggle:** flip `RunAtLoad` in the dict, write back with `NSDictionary.write(to:atomically:)`, then `monitor.launchctl("unload", plistPath)` + `monitor.launchctl("load", plistPath)` to apply
  - Plist paths:
    - Helper: `~/Library/LaunchAgents/com.melolabdev.vox-helper.plist`
    - Server: `~/Library/LaunchAgents/com.melolabdev.vox.plist`
  - No changes needed to `ServerMonitor.swift`

- [ ] **Mac App Store distribution — not needed at this time** — would require sandboxing: replace `launchctl` calls with `SMAppService` + XPC, replace LaunchAgent plists with `SMAppService.register()`. Helper is already native Swift, but the signed/notarized direct distribution path is the current plan.

- [x] **Single-instance enforcement** — VoxHelper uses `fcntl F_SETLK` on `.helper.lock`; OS releases lock on process exit. Server uses port connectivity check in `run.sh` before exec'ing uvicorn.

- [x] **Single-instance enforcement (server — PID file)** — `scripts/run.sh` and the installed production `run.sh` now maintain `~/Library/Application Support/Vox/vox-server.pid`, exit cleanly if that PID is still alive, and clear stale PID files on the next start.

- [x] **Signed `.pkg` installer for v1.0.0 release**
  - Implemented via `scripts/build-pkg.sh`.
  - Builds `assets/Vox-<version>.pkg`, signs with the Developer ID Installer certificate, submits to Apple notarization, staples the ticket, and verifies Gatekeeper install assessment.
  - Package payload installs `VoxHelper.app` and `VoxServer.app` under `/Applications/Vox/`.
  - `pkg-scripts/preinstall` checks Apple Silicon, logged-in console user, curl, internet access to GitHub/PyPI/Hugging Face, Homebrew, and Python 3.11 availability.
  - `pkg-scripts/postinstall` runs the bootstrap installer as the console user, creates the runtime directory, installs LaunchAgents, starts the helper, waits briefly for the local server, and opens the local Welcome page as the logged-in user.
  - Release asset is uploaded to GitHub Releases; landing page download section tracks filename, size, URL, and SHA256.
  - Note: macOS Installer owns the optional "move installer to Trash" prompt after install; the `.pkg` cannot suppress that prompt.

- [ ] **Post-v1: single self-contained `.app` packaging**
  - Current v1 path: signed/notarized `.pkg` and `.dmg` are the right installer flow because Vox needs a runtime directory, LaunchAgents, a Python environment, Homebrew/ffmpeg/Python checks, demo data, and helper/server app placement under `/Applications/Vox/`.
  - A single self-contained `.app` would be a different distribution model: bundle Python, dependencies, server code, and startup orchestration inside one draggable app bundle, likely with PyInstaller/py2app or a custom native wrapper.
  - Why it may be useful later: simpler drag-and-drop mental model, fewer installer scripts, and easier rollback by deleting one app bundle.
  - Why it is not needed for v1: the current `.pkg` provides the one-click experience we want today, including bootstrap setup and LaunchAgent installation. A self-contained app would be a separate architecture effort and could destabilize the RC.

- [x] **Default `VOX_HOST` to `127.0.0.1`** — Vox now defaults to local-only access. Users can opt into LAN access by setting `VOX_HOST=0.0.0.0` or using Settings → Runtime → Network access.

- [x] **Preserve app bundle signatures during build/install** — `build-apps.sh`, `install-helper.sh`, and `install-agent.sh` use `ditto` instead of recursive copy for `.app` bundles, and helper install stops the running helper before replacing `/Applications/Vox/VoxHelper.app`.

- [x] **Streamline /Applications install UX once packaging is finalized** — the signed `.pkg` is now the primary one-click installer path. It installs both app bundles to `/Applications/Vox/`, stages the bootstrap under `/Library/Application Support/Vox/Bootstrap`, and completes setup without requiring Terminal.

- [x] **Fix Developer ID codesign (`errSecInternalComponent`)** — Developer ID Application signing, Developer ID Installer signing, notarization, and stapling now work through `scripts/build-apps.sh` and `scripts/build-pkg.sh`.
  - Cert is present and chain is valid (`F8:3A:0C:69` AKID matches intermediate SKID)
  - Likely cause: private key was generated via Keychain Access GUI with Secure Enclave access controls that block `codesign`
  - Fix: revoke current cert, generate new CSR via CLI (`openssl genrsa` + `openssl req`) to avoid Secure Enclave, re-download cert from Apple Developer portal, import with `-T /usr/bin/codesign`
  - Until resolved: bundles ship unsigned; test devices right-click → Open on first launch
  - `build-apps.sh` will automatically sign once this is fixed (just re-add the `codesign` call)

- [x] **Code signing & notarization**
  - `scripts/build-apps.sh` signs `VoxHelper.app`, `VoxServer.app`, and `assets/Vox.dmg`, then calls `scripts/notarize.sh` to notarize and staple the DMG.
  - `scripts/build-pkg.sh` signs, notarizes, staples, and validates the `.pkg`.
  - Current release package passes `pkgutil --check-signature` and `spctl --assess --type install`.

---

## Voice Sources

- [ ] **[LOW] Remote audio source for voice profiles — URL import with trim**

  Add a third tab to the Voices page ("URL") alongside Upload and Record. The user pastes a direct audio URL, previews the audio in-browser, optionally trims it to a start/end range, then saves it as a voice profile.

  Product decision: after v1.0.

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

- [x] **[LOW] Voice profile icon size limit — make configurable**
  - Implemented as `VOX_VOICE_ICON_MAX_KB` / `settings.voice_icon_max_kb`, exposed by `GET /api/v1/settings`.
  - Library edit form reads the setting and updates the helper text + processed icon size validation dynamically.

  Original proposal:

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

- [x] **Smooth scroll navigation baseline** — implemented in `ui-src/src/styles.css` with `html { scroll-behavior: smooth; }`, so landing-page anchor links animate instead of jumping.

- [x] **Landing nav active-section highlighting** — implemented with `IntersectionObserver` in `ui-src/src/routes/index.tsx`; desktop and mobile nav links reflect the active section while scrolling.

---

## Configuration UI

- [x] **Decide where to surface settings editing — web UI or menu bar helper**

  Implemented in the web app Settings tab for runtime/network access, generation defaults, appearance, widgets, storage paths, and backup/restore. The native helper remains focused on server lifecycle, login toggles, update/uninstall flows, logs, resource stats, and support links.

---

## Dark Mode

- [ ] **Post-v1: finish dark theme polish**

  Dark mode is wired but not v1-ready. `ui-src/src/styles.css` has dark theme tokens and semantic surface classes, and key Create/Library/Settings surfaces have started moving to reusable `vox-*` theme primitives.

  **Current state:** functional plumbing exists, but the visual treatment still needs minor tweaks before release-quality support. For v1.0, light mode is forced and Settings shows Light as the only available theme. Existing `dark`/`system` saved preferences are normalized back to `light` on app load.

  **Follow-up pass:** verify all app tabs in dark mode, tune player/waveform contrast, replace remaining hard-coded light surfaces/arbitrary colors with semantic theme classes, and confirm landing-page behavior separately from the app shell.

---

## History Table

- [ ] **Column visibility toggle** — show/hide columns via a "Columns" dropdown. Persist to localStorage.
- [ ] **CSV export** — download current filtered view. Button in topbar next to Refresh.

Product decision: after v1.0.

---

## Backup & Restore

- [x] **Backup and restore** — implemented in Settings and `api/routers/backups.py`.
  - Export includes SQLite history/custom tones/voice metadata plus voice assets.
  - Generated output audio is intentionally excluded to keep backups small and avoid packaging expired clips.
  - Restore validates the archive, replaces the DB and voice assets, reconnects SQLite, and prompts the user to refresh Studio.

---

## User Preferences

- [x] **Server-side preferences store — DB-backed UI defaults with local cache**

  Implemented with `user_preferences` in SQLite, `GET /api/v1/preferences`, `PATCH /api/v1/preferences`, and frontend write-through caching in `ui-src/src/lib/preferences.ts`.

  **Implemented approach:**
  - Add a `user_preferences` table to SQLite:
    ```sql
    CREATE TABLE user_preferences (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,         -- JSON-encoded
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ```
  - `GET /api/v1/preferences` returns all key-value pairs as a JSON object.
  - `PATCH /api/v1/preferences` upserts one or more `vox:*` keys; `null` deletes a key.
  - Settings hydrates from the server on page load and saves generation defaults to both SQLite and localStorage.
  - Create hydrates server preferences on load and debounces changes back to the server.
  - localStorage remains a write-through cache so the UI feels instant.

  **Keys to persist server-side:**
  - `voiceId` — selected voice profile
  - `tone` — selected tone / style preset
  - `format` — mp3 or wav
  - `mp3Quality` — selected MP3 bitrate
  - `wavQuality` — selected WAV bit depth
  - `advanced` — all 6 slider values
  - `widget.requests` and `widget.minutes` — sidebar widget visibility

  Voice favorites are already persisted on voice records via `voices.is_favorite`, so they are intentionally not duplicated in `user_preferences`.

  **Why:** a single-user local app doesn't need multi-user sessions, but server-side persistence means preferences survive browser resets and work consistently across Safari, Chrome, or any other browser pointed at the local server. Also a prerequisite for any future multi-device or remote access scenario.

---

## Maintenance & Memory

- [x] **Soft-delete voice profiles — trash folder with 72h recovery window**
  - Implemented with `voices.status`, `voices.deleted_at`, and `voices/deleted/`.
  - `DELETE /voices/{name}` now moves the WAV + sidecar metadata to the deleted folder, marks the row deleted, and hides it from normal list/get/audio/TTS paths.
  - Cleanup purges deleted voices after `VOX_DELETED_VOICE_TTL_HOURS` (default 72, `0` keeps indefinitely).

  Future optional work: add a first-class restore endpoint/UI.

  Original proposal:

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

- [x] **Prune old job rows from SQLite** — cleanup task now prunes terminal job rows older than `VOX_JOB_RETENTION_DAYS` (default 30, `0` keeps indefinitely).

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

- [x] **Unify uninstall scripts into a single `uninstall.sh`**
  - Implemented as `scripts/uninstall.sh`, with interactive prompts when run directly and flags for scripted use.
  - Supports `--all`, `--agent`, `--helper`, `--data`, and `--yes`.
  - `vox.sh uninstall` now delegates to the unified script while preserving existing `--agent-only`, `--helper-only`, and `--purge` behavior.
  - Lower-level `uninstall-agent.sh` and `uninstall-helper.sh` remain available for troubleshooting and are called by the unified script.

- [x] **Install script should surface Chatterbox model download/load expectations instead of silently returning**
  - Implemented the low-effort Option B in `vox.sh`: install completion now clearly says first-run model download/load may continue in the background and points users to Vox Helper → View Logs.

- [x] **Helper tracks and displays model download/load progress**

  - Backend exposes `GET /api/v1/status` with model state: `not_loaded`, `loading`, `ready`, or `error`.
  - FastAPI starts while model loading happens in a background startup task, so the helper can show readiness during first-run downloads/loads.
  - Helper menu shows `Model loading…`, `Model ready`, `Model error`, or fallback states.
  - TTS requests return `503` with a clear message until the model is ready.

- [x] **Add `--yes` flag to skip interactive prompts during clean install**

  Implemented on the supported entry point: `bash vox.sh install --yes`. This accepts defaults, skips prompts, and can be paired with `--token hf_xxx` for non-interactive installs.

  **Prompts to auto-accept with `-y`:**
  - First, audit `setup.sh` to enumerate every `read`/`select` prompt currently present — the exact list needs to be confirmed against the current script.
  - Likely candidates: install server LaunchAgent? [Y/n], install menu bar helper? [Y/n], HF token prompt (skip / leave blank by default), any overwrite/reinstall confirmations.

  **Implementation:** check whether a simple `yes |` pipe (`yes | bash setup.sh`) already works, or whether prompts need explicit `-y` branching. Some `read` calls with `-r` may not respond to piped input correctly — if so, add a `YES=false` flag at the top of the script and wrap each prompt: `if $YES; then ANSWER=y; else read ...`.

  **Also apply to:** `install-agent.sh`, `install-helper.sh` — any script that is called from `setup.sh` and adds its own prompts should accept a passed-through `-y` flag.

- [x] **Add remaining CLI flags to update workflows for scripted/development use**
  - `scripts/update.sh` supports `--force`, `--no-restart`, `--agent-only`, and `--helper-only`.
  - `vox.sh update` forwards `--force`, `--agent-only`, and `--helper-only`.
  - Updates compare against `installed_version.json` and skip redundant dependency sync/restarts when already current.

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

- [x] **[PRE-RELEASE BLOCKER] Unified release workflow — eliminate version number discrepancies before v1.0.0**

  Implemented via `VERSION`, `scripts/write-build-info.sh`, and `scripts/release.sh`.
  - `VERSION` — release version used by build scripts
  - `build_info.json` — stamped version, source commit, and UTC build time
  - `scripts/build-apps.sh` — reads `VERSION` and bundles `build_info.json` into VoxHelper.app and VoxServer.app
  - `CHANGELOG.md` — version header for the new release section
  - Git tag on `main` / `development`
  - Landing page package filename, size, URL, and SHA256 checksum still require post-package update

  `bash scripts/release.sh <version>` updates `VERSION`, stamps build info, builds UI, commits release prep, builds/signs/notarizes DMG and PKG, computes package size/SHA256, updates landing package metadata, commits, tags, pushes, and uploads the package to GitHub Releases.

- [x] **Track installed version and prevent redundant installs/updates**
  - Install and update write `~/Library/Application Support/Vox/installed_version.json`.
  - `vox.sh update` / `scripts/update.sh` compare the installed source build against the desired source build and exit cleanly when already current.
  - `--force` bypasses the skip.

---

## Installation & Diagnostics

- [x] **Write install log to `~/Library/Logs/Vox/install.log`**
  - `setup.sh`, `install-agent.sh`, and `install-helper.sh` should tee all output to a timestamped install log so failed installs can be diagnosed without the user having to reproduce the issue in front of you.
  - Each script appends to the same file with a clear header (script name + timestamp + macOS version + architecture).
  - On failure, the error and the last few lines of context are preserved so the exact step that failed is obvious.
  - Suggested implementation: `exec > >(tee -a "$LOG_FILE") 2>&1` at the top of each script after the log dir is created.

---

## Pre-Release Code Review

- [x] **Full codebase optimization pass** — before cutting v1.0, do a complete review of all code for:
  - Dead code, unused imports, redundant logic
  - API response consistency (error shapes, status codes, headers)
  - SQL queries — missing indexes, N+1 patterns, unbounded SELECTs
  - Python async correctness — any blocking calls on the event loop
  - Security — input validation at API boundaries, path traversal in file endpoints, filename sanitization
  - Memory usage — large objects held longer than needed (model weights, audio buffers)
  - Shell scripts — `set -euo pipefail`, quoting, error messages
  - Frontend JS — dead event listeners, missing error states, console warnings
  - Do this after the testing strategy is in place so issues found can be covered by tests

  **Pass 1 completed:** fixed chunk-stitch pause placement and avoided repeated audio-array concatenation in `api/routers/tts.py`; reduced `/api/v1/stats` sparkline work from seven per-day queries to one grouped query; corrected `scripts/update.sh` so update stops the server before syncing instead of kickstarting it.

  **Pass 2 completed:** added shared frontend preference helpers, added DB-backed preference endpoints, kept API error compatibility while adding structured `error` and `request_id` fields, tightened the main manual run/update shell scripts, and re-audited the remaining shell entry points for quoting/destructive operations.

  **Deferred by decision:** optional post-v1 worker-queue architecture.

---

## API & Performance

- [x] **[DONE] Version API endpoints under `/api/v1/`**

  All product routes are now served under `/api/v1/` prefix (`/api/v1/tts`, `/api/v1/voices`, `/api/v1/jobs`, `/api/v1/presets`, `/api/v1/stats`, `/api/v1/settings`). The unversioned `/health` endpoint remains at the root as a shallow liveness check. Frontend `api.ts` updated to match. Landing page code snippets updated. README API reference updated.

- [ ] **Post-v1: streaming audio response** — chunked transfer encoding for playback-before-complete if the model/output pipeline can support it cleanly.
- [ ] **Post-v1: review SDK support** — revisit Python and JavaScript SDKs after the local REST API surface stabilizes. Keep the landing page focused on the curl example for v1.
- [ ] **Post-v1: proper worker queue architecture** — replace single `asyncio.Lock` with an explicit worker queue only if real-world testing shows the current serialized lock is not enough.
  - Backend: queue incoming requests when a generation is already in progress instead of letting overlapping jobs stack up; return a job ID immediately with `202 Accepted` and expose `GET /jobs/{id}/status` for polling or SSE.
  - Current state: requests are accepted immediately, serialized by a single local model lock, and the UI shows simple queued/running states plus elapsed time in both the global top bar and Create result panel.
  - Future UI: consider a compact queue-status widget that shows `Queued`, `Running`, and `Next up` states across multiple pending jobs.
  - Pair with the sidebar stats item below so queue depth can live alongside session metrics.
  - Recovery: if the app restarts while a job is in flight, reconcile the persisted job state on startup so the UI does not show duplicate or orphaned runs.
- [x] **Kill switch for in-flight jobs** — add an explicit way to stop work that is already running.
  Implemented with `POST /api/v1/tts/{request_id}/cancel`, active-task tracking, cancelled job status, Create-page cancel control, and global cancel control. Stale queued/processing jobs from agent restarts are marked failed on startup so the UI does not show orphaned runs.
- [x] **Sidebar stats panel** — implemented in `ui-src/src/routes/app.tsx`.
  - The left sidebar now includes Requests, Audio Generated, and Library & Storage widgets using `/api/v1/stats`.
  - Widgets are user-toggleable from Settings and persist via localStorage.

  Future optional work: add queue depth if a dedicated queue architecture is reintroduced after v1.

  Original proposal:
  - Use the empty space in the left navigation bar to surface live server stats.
  - Candidates: requests processed (session + all-time), audio minutes generated (session + all-time), current queue depth, average generation time.
  - Pull from existing SQLite job history for all-time counts; track session counts in memory.
  - Update on each completed job — no polling needed if driven by the same SSE stream as queue feedback.
  - Display as a compact, non-interactive stats block near the bottom of the nav sidebar, and reserve one slot for queue state if the widget idea lands first.
- [x] Server-sent events for real-time generation progress — implemented as `GET /api/v1/jobs/{request_id}/events`, with polling retained as fallback.

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
