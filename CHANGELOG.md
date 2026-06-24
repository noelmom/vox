# Changelog

All notable changes to Codename Vox are tracked here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — development branch

### Added
- **React 19 SPA — Generate page history panel** — previous completed jobs load from `GET /jobs` below the current Output card. Newest First / Oldest sort toggle and a live filter search bar. Shows 5 jobs initially; "Load more" reveals 3 more per click. Current Output job is excluded from History to avoid duplicates.
- **Single audio player enforcement** — only one audio player (across Output, History, and Voices) can play at a time. Pressing play on any `JobRow` or `ProfileCard` pauses all others via lifted `activePlayerId` state and an `onActivate` callback.
- **Expired file detection on load** — `GET /jobs` response includes a `file_available` boolean computed server-side via `Path(output_path).exists()`. Expired jobs render immediately with an amber panel showing "Copy Script" (copies text to clipboard) and "Regenerate" — no extra round-trip needed.
- **Voices page — full React rewrite** — replaced placeholder with two-tab layout:
  - *Upload tab:* drag-and-drop or file picker with audio preview, name / description / tags fields, real-time upload to `POST /voices`.
  - *Record tab:* full mic permission flow with distinct `no-device` (amber, "Connect a microphone") and `denied` (red, "Open browser site settings") error states; device selector dropdown when more than one mic is available (`enumerateDevices()` after permission); MediaRecorder with 250 ms chunks; playback preview before saving; "Save as Voice Profile" calls `POST /voices`.
  - *ProfileCard grid:* lazy audio fetch per card, single-player coordination, two-step delete confirm, "Use" button writes profile to `localStorage` and navigates to Generate.

### Fixed
- **API docs Schemas section styling** — hyperlinks and text now readable with monochromatic blue/dark color scheme applied via Swagger UI CSS override.
- **Audio player waveform sync** — waveform bars now update in sync with both playback timeline and manual seek slider dragging.
- **Waveform bars disappearing at end** — bars now stay filled throughout end-of-playback instead of vanishing.
- **ETA estimation** — progress bar no longer fills too fast; added 1.3× safety multiplier and improved messaging (shows "Finalizing…" when estimate exceeded).
- **Generation silently failing over Cloudflare tunnels and slow connections** — long generations (>100s) would complete successfully on the server but never deliver audio to the browser. Two-part fix:

  **Root cause 1 — synchronous HTTP response:** `POST /tts` previously held the HTTP connection open for the entire generation duration (up to several minutes). Cloudflare tunnels enforce a ~100s idle timeout and would kill the connection before the server could respond, leaving the file on disk but showing nothing in the UI.

  **Fix:** `POST /tts` now returns `202 Accepted` with a `{ request_id }` immediately after queuing the job. Generation runs as an `asyncio` background task. The UI polls `GET /jobs/{request_id}` every 2 seconds until `status` is `completed` or `failed`, then fetches the audio from the new `GET /jobs/{request_id}/audio` endpoint.

  **Root cause 2 — blocked event loop:** Even with the async job approach, `model.generate()` is a blocking CPU/GPU-bound call that froze the entire asyncio event loop during inference. This prevented the polling requests from being served while generation was running — same timeout symptom, different layer.

  **Fix:** `model.generate()` is now dispatched via `asyncio.get_running_loop().run_in_executor(None, ...)`, running inference in a thread pool so the event loop remains free to serve status polls throughout generation.

- **Canvas waveform players across all screens** — all audio playback surfaces replaced with an `OutputPlayer`-style canvas player: `JobRow` in the Generate result and Recent list, `ClipCard` in Recordings, `ProfileCard` in Library, the Upload preview pane, and the voice preview player. Each renders a seeded-random peak waveform with a progress overlay, interactive seek, volume/speed controls, and time display. Single-player coordination via lifted `activePlayerId` state.

- **Real mic waveform in RecordPane** — replaced the decorative sine-wave visualizer with a live RMS-driven canvas bar history while recording, and a decoded amplitude waveform shown during playback preview. Includes a playhead that advances with the audio element's `timeupdate` event.

- **`RecordPane` UI rewrite** — matches the AudioStudio design: live waveform above control strip, full-width stop/pause controls, elapsed timer, and preview player after recording completes.

### Fixed

- **API URL paths corrected in frontend** — `api.ts` was calling `/jobs/{id}/audio` and `/voices/{id}` (wrong base paths); corrected to `/api/v1/jobs/{id}/audio` and `/api/v1/voices/{id}` to match the versioned backend router prefixes.

- **Transport bar layout — always fully visible** — replaced `flex-wrap` on the `JobRow` transport bar with an explicit two-row layout (`flex-col` on mobile, `flex-row sm:`) so the card height is deterministic at every viewport width. Eliminates a Safari/WebKit bug where `flex-wrap + align-items: center` failed to expand the container height when items wrapped to a second line.

---

## [0.4.1-beta] — 2026-06-22

### Added
- **Webm to WAV conversion** — audio uploads now accept `.webm` format (e.g., from browser recording) and auto-convert to 24kHz mono WAV with ffmpeg.

### Fixed
- Landing page footer version bumped to v0.4.1-beta.

---

## [0.4.0-beta] — 2026-06-21

### Changed
- **VoxHelper rewritten in native Swift** — replaces the Python/rumps/PyObjC helper entirely. Eliminates the quit-then-reopen bug caused by PyObjC teardown hang and macOS Sequoia `NSSceneStatusItem` session context failure. Swift binary uses `NSApplication.terminate(nil)` for clean exit and registers correctly with Launch Services from any launch path.
- Single-instance lock now uses `fcntl F_SETLK` in Swift (`main.swift`) — non-blocking write lock, OS releases it unconditionally on process exit regardless of how the process dies.
- `voxhelper/` directory replaces `menubar/vox_helper.py` as the helper source. Four Swift files: `main.swift`, `AppDelegate.swift`, `StatusBarController.swift`, `ServerMonitor.swift`.
- `scripts/build-apps.sh`: VoxHelper built with `swiftc -target arm64-apple-macos13.0` instead of C launcher + Python script.
- `scripts/install-helper.sh`: removed venv/pip setup for helper; plist `ProgramArguments` points directly to Swift binary.
- `scripts/update.sh`, `setup.sh`: removed stale `menubar/` sync steps.
- `scripts/uninstall-helper.sh`: removes `VoxHelper.app` from `/Applications`.

### Added
- Intel Mac block in `vox.sh` and `scripts/build-apps.sh` (`uname -m` check — exits with clear error on non-arm64).
- Server single-instance guard in `scripts/run.sh`: port connectivity check before `exec uvicorn`; exits cleanly if server already running.

### Fixed
- **HF_TOKEN not passed to uvicorn** — Swift launcher now merges all .env variables (including `HF_TOKEN`) into the environment passed to uvicorn. Previously only forwarded `VOX_HOST`, `VOX_DEVICE`, `VOX_PORT`. This enables authenticated HuggingFace downloads and significantly improves model inference speed (~10-20x faster TTS generation).
- **Helper shows "Server stopped" during TTS generation** — replaced HTTP health check (which timed out under heavy CPU load) with native Swift TCP connection check to the configured port. Helper now shows accurate "Running" status even while generating audio. Health check respects `VOX_PORT` configuration and defaults to 8000 if not set.

---

## [0.3.1-beta] — 2026-06-21

### Added
- **`vox.sh` unified entry point** — single script for install, update, and uninstall with flags: `--yes`, `--token`, `--agent-only`, `--helper-only`, `--purge`, `--zip`, `--devbranch`, `--branch`.
- **`--devbranch` / `--branch` global flag** — switches the local git repo to the specified branch before any command runs, so `install`, `update`, and `uninstall` all use scripts from the target branch. Enables easy switching between `main` (stable) and `development` (beta).
- **Recording UX improvements** — hint text ("30–60 seconds is usually enough"), 5-minute auto-stop, warning at 4:00 remaining with accent colour, ObjectURL memory leak fixed on discard.
- **Microphone detection on page load** — voice recorder now checks for audio input devices via `enumerateDevices()` on load. Shows a friendly banner with a retry button instead of an error when no mic is found (e.g. Mac Mini).
- **`development` branch and PR workflow** — `main` is now stable/tagged only; all work happens on `development` and merges via PR.

### Changed
- Install flow simplified: three-step `setup.sh` → `install-agent.sh` → `install-helper.sh` replaced by `bash vox.sh install`.
- Landing page, README, and `scripts/README.md` updated to reflect `vox.sh` as the primary entry point.
- Runtime permanently moved to `~/Library/Application Support/Vox/` — project folder is source-only.
- All launchctl commands use domain-qualified `gui/{uid}/label` form.
- `update.sh` `set -euo pipefail` → `set -eo pipefail` to fix `BRANCH?: unbound variable` on macOS bash 3.2.

### Fixed
- `bash vox.sh update` without Vox installed no longer throws `BRANCH?: unbound variable`.
- Copy address in menu bar helper now shows LAN IP instead of localhost when `VOX_HOST=0.0.0.0`.
- Safari `OverconstrainedError` on recording — retry with `{ audio: {} }` constraint fallback.
- `launchctl stop` / `kickstart` commands corrected to domain-qualified form throughout.

---

## [0.2.0-beta] — 2026-06-18 to 2026-06-20

### Added
- **macOS menu bar helper** — `menubar/vox_helper.py` (rumps-based). Shows ●/○ server status, LAN IP or localhost depending on `VOX_HOST` config, CPU %, RAM used/total, Start/Stop/Restart server via launchctl, Open in Browser, View Logs. Auto-starts on login via its own LaunchAgent. No Dock icon — menu bar only.
- **LaunchAgent for helper** — `launchagent/com.melolabdev.vox-helper.plist`. `RunAtLoad=true` so the icon always appears on login.
- **install-helper.sh / uninstall-helper.sh** — one-command install and removal of the helper agent.
- **Smart address display** — helper shows `192.168.x.x:PORT · network accessible` when `VOX_HOST=0.0.0.0`, or `localhost:PORT · local only` when restricted to `127.0.0.1`.

### Changed
- `run.sh` moved to `scripts/run.sh` — all scripts now live in `scripts/`.
- `scripts/README.md` added with full reference for all scripts and when to use manual start vs LaunchAgent.
- Landing page CTA updated to reflect full install flow (setup → install-agent → install-helper).
- httpx / httpcore log level set to WARNING — suppresses noisy 302 redirect lines from HuggingFace model checks on startup.
- `GET /health 200` access log lines filtered out — menu bar helper polls every 5s which would produce ~17k noise lines/day.
- History date format changed to `MM/DD/YYYY at H:MM AM/PM`.
- History duration uses M:SS format instead of raw seconds.
- History voice shows `Generic` instead of `—` when no profile is selected.
- Generate stats (Duration, Generation) use M:SS format.
- Menu bar helper polling switched from `threading.Timer` churn to a single persistent daemon thread — eliminates OS thread allocation on every poll tick.
- Menu bar status item simplified to plain `Running…` / `Stopped…` (grey, non-interactive); coloured emoji reserved for the menu bar title only.
- Copy buttons in history table made visible (solid background + border instead of transparent).

### Fixed
- Copy buttons in `app.html` history failing on `http://localhost` — clipboard API requires secure context; added `execCommand('copy')` fallback.
- Landing page copy buttons not showing toast — handler was synchronous; made `async` so toast fires after copy resolves.
- Copy confirmation added everywhere: history copy buttons show `toastSuccess`, landing page shows pill toast, menu bar shows macOS notification.

### Added
- **Custom Tone** — a "✦ Custom" pill added to the Tone row on the Generate screen. Clicking it opens a panel with sliders + number inputs for all 6 TTS parameters (Exaggeration, CFG Weight, Temperature, Repetition Penalty, Top P, Min P). Each param shows a short hint. Clicking the pill again collapses/expands the panel without losing the selection. Values are validated on Save (empty or out-of-range fields show inline errors). Settings persist to `localStorage` and survive page reloads. Seeded with `default` preset values on first use. When Custom is active, generation passes `preset=default` plus the saved custom params as individual overrides — no backend changes required.
- **Generation ETA** — while TTS is running, a progress bar appears below the Generate button showing elapsed time and estimated time remaining. Estimate is derived from character count (~140 chars/sec of speech) × the average RTF from recent completed jobs (falls back to 0.3× if no history).
- **Real upload progress** — voice file uploads (both file picker and in-browser recordings) now use XHR instead of fetch, showing a live progress bar with percentage, bytes transferred, and ETA in seconds.
- **`uploadVoiceWithProgress`** added to `api.js` — XHR-backed upload that fires a progress callback with `{ percent, bytesLoaded, bytesTotal, speedBps, etaSec }`.
- **Server-sent events for generation progress** — added to backlog for a future iteration.
- **In-browser voice recording** — "Record" tab on the Voices screen lets users capture microphone audio directly. Shows a live waveform visualizer while recording, a timer, a playback preview before saving, and a Discard option to re-record. Saved recordings are tagged `recorded` and uploaded via the same `POST /voices` endpoint as file uploads.
- **Voice Profile editing** — Edit button on each voice card opens a modal to update description, tags, and advanced TTS parameters (exaggeration, CFG weight, temperature, repetition penalty, top-p, min-p).
- **Tag system for voice profiles** — Tags stored per voice; default tags are `uploaded` (manual uploads) and `auto-import` (folder watcher). Custom tags can be added from the edit modal.
- **Tag filter pills** on the Voices screen — filter the voice grid by any tag or view all.
- **Tag badges** on voice cards — color-coded (blue = uploaded, green = auto-import).
- **Unique output filenames** — Generated audio files are named `{voice_name}-{YYYYMMDD-HHMMSS}.mp3` instead of a generic name.
- **History: copy to clipboard** — Request ID and text columns each have a copy icon.
- **History: horizontal scroll fix** — Table no longer overflows on small screens.
- **Pulsing status dot** — The green "ready" indicator now pulses.
- **Improved status text** — Health indicator shows "Ready · Apple MPS", "Starting up…", or "Server offline" instead of raw device strings.
- **Tooltip system** — `?` icons on Voice Profile, Output Format, and Tone show fixed-position tooltips that escape scroll containers.
- **TONE label** on preset pills so users know what the row represents.
- **Voice name + timestamp in audio filenames** for uniqueness.
- **`voice_name` in history** — Jobs table JOIN returns the voice name used per job.

### Changed
- Label "Voice" → "Voice Profile" in Generate screen.
- Dropdown option "No voice (default)" → "Generic" (no voice cloning implied).
- `/health` endpoint returns structured JSON; `healthCheck()` in the API client now hits `/health` instead of `/`.
- History table column "Preset" renamed to "Tone".

### Fixed
- Audio player double-listener bug — `wirePlayer()` was called twice (once inside `renderGenerate`, once in `runGenerate`'s finally block), causing play to immediately cancel itself. Removed the duplicate call.
- Tooltips clipped by `overflow: hidden` on `.gen-panel` and `overflow-y: auto` on the scroll container — replaced with a single `position: fixed` global tooltip driven by `getBoundingClientRect()`.
- Toolbar corner rounding lost after removing `overflow: hidden` — re-applied `border-radius` directly on `.gen-toolbar`.

---

## [0.1.0] — 2026-06-18 — Initial Web UI snapshot

### Added
- **Landing page** (`/`) — hero, security section, how-it-works, features grid, API snippet, CTA band, footer.
- **App shell** (`/app`) — sidebar nav, topbar, 4 screens: Generate, Voices, History, Settings.
- **Generate screen** — text area, Voice Profile selector, Output Format selector, Tone preset pills, Generate button, inline audio player with waveform progress bar.
- **Voices screen** — voice grid with cards, drag-and-drop upload zone, name + description fields.
- **History screen** — jobs table with request ID, voice, tone, status, duration, RTF, created-at.
- **Settings screen** — read-only display of server config (output TTL, input dir, device, version).
- **Toast notifications** — success/error toasts with auto-dismiss.
- **Folder watcher** — drop audio files into `input/` for automatic voice profile registration (tagged `auto-import`).
- **SQLite job tracking** — every TTS request logged with timing, RTF, status, and voice reference.
- **Preset system** — configurable YAML presets (default, youtube, hype, news) with per-field TTS overrides.
- **Audio conversion** — accepts WAV, M4A, MP3, AIFF, FLAC, OGG; converts to WAV via ffmpeg.
- **MPS acceleration** — runs on Apple Silicon GPU via PyTorch MPS device.

---

## [0.0.1] — 2026-06-15 — Initial scaffold

### Added
- FastAPI application scaffold with Uvicorn.
- Chatterbox TTS engine wrapper with MPS/CPU device selection.
- `POST /tts` endpoint — accepts text + optional voice file, returns audio stream.
- `GET/POST/DELETE /voices` — voice profile CRUD backed by SQLite.
- `GET /jobs` — job history listing.
- `GET /presets` — list available tone presets.
- `GET /health` — server health and device info.
- Environment-based config via `.env` / Pydantic Settings.
- Structured JSON logging with per-request IDs.
