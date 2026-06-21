# Changelog

All notable changes to Codename Vox are tracked here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

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
