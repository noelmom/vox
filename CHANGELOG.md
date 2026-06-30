# Changelog

All notable changes to Codename Vox are tracked here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## Unreleased

### Changed
- Repository rename planned after v1.0 RC validation: `MeloLabDev/codename-vox` will become `noelmom/vox`.

## [1.0.0-rc6] — 2026-06-29

### Fixed
- **TTS API compatibility** — relaxed the broad RC5 API input validation pass after it proved too strict for generation behavior on test hardware. Server Settings still keep bounded validation for `.env` values that can affect startup.

## [1.0.0-rc5] — 2026-06-29

### Changed
- **Menu bar identity polish** — replaced the helper status icon with a native-feeling monochrome VOX wordmark: white while running and dimmed gray while stopped.
- **Release workflow hardening** — package signing now unlocks the login keychain before `productsign`, preventing silent hangs during `.pkg` builds.
- **Public page metadata** — release automation now updates the visible package version pill along with filename, release URL, size, and SHA256.

### Fixed
- **Server-setting clarity** — Settings now distinguishes Default per-chunk max from Chunk headroom, validates both, and documents the hard max versus soft packing target.

## [1.0.0-rc4] — 2026-06-29

### Added
- **Public/local page split** — added `public-site/index.html` for GitHub Pages marketing/download SEO and `public-site/agents/SKILL.md` for AI-agent REST API integration.
- **Installed welcome page** — local `/` now focuses on post-install setup status, app/docs links, API examples, file locations, and troubleshooting while `/app` remains Vox Studio.
- **First-run package launch** — signed `.pkg` installs now open the local Welcome page as the logged-in user after bootstrap completes.

### Changed
- **Release metadata target** — `scripts/release.sh` now updates package filename, URL, size, and SHA256 in `public-site/index.html`.
- **Menu bar status icon** — Vox Helper now uses a compact monochrome VOX wordmark with white running and dimmed gray stopped states.
- **Public hero refresh** — updated the public landing page hero screenshot to the current Vox Studio UI.
- **Settings polish** — exposed Output TTL, Voice clip limit, Default per-chunk max, and Chunk headroom as validated restart-required server settings.

### Fixed
- **API validation hardening** — tightened validation for TTS, voice profiles, jobs, logs, presets, backups, and server settings.
- **Create script editor** — script drafts persist, spellcheck is explicit, and auto-capitalization respects user edits without moving the cursor.
- **Package signing workflow** — `scripts/build-pkg.sh` now unlocks the login keychain before `productsign` to prevent silent signing hangs.

## [1.0.0-rc3] — 2026-06-29

### Changed
- **Installer experience** — refreshed signed/notarized DMG and PKG builds, improved installer status messaging, and tightened one-click bootstrap behavior.

---

## [1.0.0-rc2] — 2026-06-29

### Added
- **Server-backed UI preferences** — Create and Settings now sync generation defaults through `GET/PATCH /api/v1/preferences` while keeping localStorage as a fast cache.
- **Structured API error envelope** — HTTP errors keep the existing `detail` field and now include `error.code`, `error.message`, and `request_id` for easier API/debug support.

### Changed
- **Backlog and release docs** — post-v1 feature decisions are documented, including pause insertion, pronunciation controls, URL voice import, non-verbal cues, history exports, dark mode polish, and single self-contained `.app` packaging.
- **Shell hardening** — manual run/update scripts now use stricter shell settings and remain covered by syntax checks.

### Removed
- **Experimental MPS memory setting** — removed `VOX_MPS_MEMORY_FRACTION` and the PyTorch MPS memory-fraction hook after testing showed repeatable MPS out-of-memory regressions. Vox now leaves PyTorch MPS allocator behavior at its normal default.

---

## [1.0.0-rc1] — 2026-06-28

### Added
- **Server-sent job events** — `GET /api/v1/jobs/{request_id}/events` streams job updates to the Create page, with slower polling retained as a fallback.
- **Backup and restore** — Settings can export/import a Vox backup zip containing SQLite history and voice assets.
- **Theme plumbing** — light mode is enforced for v1.0 while dark-mode tokens and theme primitives remain in place for post-v1 polish.
- **README screenshots** — documentation now includes current Create, Library, Recordings, and Settings screenshots.

### Fixed
- **Trim limit feedback** — voice sample trim controls now display the 2:00 limit consistently, tolerate tiny drag/rounding differences, clamp near-boundary exports to the configured limit, and explain when the selected clip is too long to save.

## [0.5.3-beta] — 2026-06-28

### Added
- **Build identity in app and helper** — Vox now stamps `version`, git commit, and build time into `build_info.json`.
- **Studio/helper version split** — `/app` shows the Studio/server build, while the native helper menu shows both the installed Studio build and the helper bundle build so web-only updates can be identified separately from native app updates.

### Changed
- **Create page polish** — Voice Studio stays at the top on single-column intermediate widths, info tips work again, and Tone / Style now uses a grouped selector instead of an ever-growing chip cloud.

## [0.5.2-beta] — 2026-06-28

### Added
- **Operational diagnostics** — structured alert banners plus bounded log-tail endpoints for easier support without opening raw log files.
- **Installer-first run guidance** — package installs now surface the expected first model download/load behavior so the one-click path feels less mysterious.
- **Unified uninstall path** — `scripts/uninstall.sh`, `vox.sh uninstall`, and the helper uninstall action now share the same cleanup behavior.

### Fixed
- **Release and installer hardening** — `.pkg` installs stage both apps in `/Applications/Vox/`, bootstrap the runtime, validate connectivity before install, and avoid redundant app replacement when the installed bundle version already matches.
- **Server lifecycle guards** — PID-file startup checks prevent duplicate server processes and stale PID files are cleared on the next launch.
- **Voice/profile cleanup** — deleted voice profiles are soft-deleted first, moved under `voices/deleted/`, and purged after the configured TTL.
- **Backlog/UI cleanup** — completed waveform, mic-recorder, signing, notarization, app icon, and smooth-scroll items were verified and the public landing screenshot/package metadata were refreshed.

## [0.5.1-beta] — 2026-06-28

### Added
- **React 19 SPA — Generate page history panel** — previous completed jobs load from `GET /jobs` below the current Output card. Newest First / Oldest sort toggle and a live filter search bar. Shows 5 jobs initially; "Load more" reveals 3 more per click. Current Output job is excluded from History to avoid duplicates.
- **Single audio player enforcement** — only one audio player (across Output, History, and Voices) can play at a time. Pressing play on any `JobRow` or `ProfileCard` pauses all others via lifted `activePlayerId` state and an `onActivate` callback.
- **Expired file detection on load** — `GET /jobs` response includes a `file_available` boolean computed server-side via `Path(output_path).exists()`. Expired jobs render immediately with an amber panel and copy/regenerate actions where appropriate — no extra round-trip needed.
- **Generation cancellation and global status bar** — queued/running jobs are tracked globally, continue across tab navigation, expose a compact top-bar status, and can be cancelled from both the global control and the Create result panel.
- **Recent script history** — generated scripts are saved locally in a capped, deduped history dropdown on the Create page for quick reuse.
- **Custom preset update/save-as flow** — saved user tones can now be updated in place, saved as a variant, renamed, or removed from the Create page.
- **Network access mode** — Vox now defaults to `127.0.0.1` local-only access, with a Settings toggle for LAN access (`0.0.0.0`) and a restart-required badge when the saved host differs from the active server host.
- **Modern menu bar status icon** — the native helper now uses a monochrome template `VOX` icon instead of colored status dots. Running shows a pulse underline; stopped shows a broken underline.
- **Voices page — full React rewrite** — replaced placeholder with two-tab layout:
  - *Upload tab:* drag-and-drop or file picker with audio preview, name / description / tags fields, real-time upload to `POST /voices`.
  - *Record tab:* full mic permission flow with distinct `no-device` (amber, "Connect a microphone") and `denied` (red, "Open browser site settings") error states; device selector dropdown when more than one mic is available (`enumerateDevices()` after permission); MediaRecorder with 250 ms chunks; playback preview before saving; "Save as Voice Profile" calls `POST /voices`.
  - *ProfileCard grid:* lazy audio fetch per card, single-player coordination, two-step delete confirm, "Use" button writes profile to `localStorage` and navigates to Generate.

### Fixed
- **API docs Schemas section styling** — hyperlinks and text now readable with monochromatic blue/dark color scheme applied via Swagger UI CSS override.
- **Audio player waveform sync** — waveform bars now update in sync with both playback timeline and manual seek slider dragging.
- **Waveform bars disappearing at end** — bars now stay filled throughout end-of-playback instead of vanishing.
- **ETA estimation** — progress bar no longer fills too fast; added 1.3× safety multiplier and improved messaging (shows "Finalizing…" when estimate exceeded).
- **Create-page elapsed timer reset** — starting a new generation now resets the local Create result timer to `0:00`, matching the global status timer.
- **Medium-script chunking stability** — sentence packing now avoids tiny standalone chunks that could stall Chatterbox on short sentences.
- **Generation timeout and stale-job cleanup** — each chunk render has a bounded timeout, cancelled jobs cannot be overwritten by late failures/completions, and queued/processing jobs left behind by an agent restart are marked failed on startup.
- **Persistent generation failure UI** — failed jobs render an inline error card with the server message, request ID, copy action, Retry, and Dismiss instead of relying on a disappearing toast.
- **Menu bar helper address refresh** — the helper re-reads `.env` while polling, so switching between local-only and LAN access updates the displayed/copyable address after the local server restarts.
- **Signed app copy preservation** — build and helper install scripts now use `ditto` and stop the helper before replacing it, preserving bundle code signatures through DMG build/install.
- **Install/update git prerequisite checks** — `vox.sh`, `scripts/update.sh`, and `setup.sh` now surface clear Xcode Command Line Tools guidance when git is unavailable.
- **Generation silently failing over Cloudflare tunnels and slow connections** — long generations (>100s) would complete successfully on the server but never deliver audio to the browser. Two-part fix:

  **Root cause 1 — synchronous HTTP response:** `POST /tts` previously held the HTTP connection open for the entire generation duration (up to several minutes). Cloudflare tunnels enforce a ~100s idle timeout and would kill the connection before the server could respond, leaving the file on disk but showing nothing in the UI.

  **Fix:** `POST /tts` now returns `202 Accepted` with a `{ request_id }` immediately after queuing the job. Generation runs as an `asyncio` background task. The UI polls `GET /jobs/{request_id}` every 2 seconds until `status` is `completed` or `failed`, then fetches the audio from the new `GET /jobs/{request_id}/audio` endpoint.

  **Root cause 2 — blocked event loop:** Even with the async job approach, `model.generate()` is a blocking CPU/GPU-bound call that froze the entire asyncio event loop during inference. This prevented the polling requests from being served while generation was running — same timeout symptom, different layer.

  **Fix:** `model.generate()` is now dispatched via `asyncio.get_running_loop().run_in_executor(None, ...)`, running inference in a thread pool so the event loop remains free to serve status polls throughout generation.

- **Canvas waveform players across all screens** — all audio playback surfaces replaced with an `OutputPlayer`-style canvas player: `JobRow` in the Generate result and Recent list, `ClipCard` in Recordings, `ProfileCard` in Library, the Upload preview pane, and the voice preview player. Generated/recorded audio decodes real amplitude peaks where available, with deterministic placeholders only as fallbacks before audio is loaded. Single-player coordination via lifted `activePlayerId` state.

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
