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

- [x] **Update `setup.sh` post-install instructions** — now prints the correct install-agent → install-helper → start flow. Also creates `~/Library/LaunchAgents` and `~/Library/Logs/VoxForge` so install scripts never fail on a clean macOS install.

- [ ] **Restart transition state — "🟡 Restarting…"**
  - When the user clicks ↺ Restart, immediately set title to `"🟡 Vox"` and status item to `"Restarting…"` before the poll cycle confirms anything.
  - Hold that state for up to ~15s (reasonable worst-case for launchd to stop + start the server).
  - If health check comes back healthy within the window → transition to `🟢 Running…` as normal.
  - If the window expires with no healthy response → transition to `🔴 Stopped…` so the user knows something went wrong.
  - Avoids the confusing jump from Restarting directly to red/Stopped during the normal stop phase of a restart.

- [ ] **GPU / MPS utilization** — `psutil` has no MPS API. Options: parse `powermetrics` (requires sudo, not ideal) or use IOKit via PyObjC (what Stats.app uses). Defer until Swift rewrite investigation is complete — native Swift can access IOKit cleanly.

---

## Packaging & Distribution

- [x] **LaunchAgent — server** — `launchagent/com.melolabdev.vox.plist`. Manual start, crash-restart, logs to `~/Library/Logs/VoxForge/`.
- [x] **LaunchAgent — menu bar helper** — `launchagent/com.melolabdev.vox-helper.plist`. Auto-starts on login.
- [x] **macOS menu bar helper (rumps)** — status dot, CPU/RAM, server control, copy address, open browser, view logs.

- [ ] **Fix LaunchAgent display name ("env")** — macOS Login Items shows `env` because `ProgramArguments` starts with `/usr/bin/env`. Fix: replace with `/bin/bash scripts/run.sh` directly. Do before public release.

- [ ] **Auto-launch on login (server)** — flip `RunAtLoad` from `<false/>` to `<true/>` in `launchagent/com.melolabdev.vox.plist` when shipping the `.app`. Helper already auto-starts.

- [ ] **Investigate rewrite in Swift (native macOS)** — rumps works well for v1 but Swift would give: NSPopover with richer UI, SF Symbols, real IOKit GPU stats, tighter macOS integration, single signed binary. Key decision: macOS-only forever (go Swift) or cross-platform later (keep Python). Not a production blocker.

- [ ] **One-click `.app` packaging** — PyInstaller or py2app. Bundle Python, venv, and the server into a single distributable app.

- [ ] **Default `VOX_HOST` to `127.0.0.1`** once packaged as a macOS app.

- [ ] **Code signing & notarization** — Apple Developer ID certificate required before public release.
  - Sign `.app` bundle with `codesign`
  - Submit to Apple with `notarytool`, staple with `stapler`
  - Without this: every user sees "unidentified developer" and Sequoia may block launch entirely.
  - Prerequisite: Apple Developer Program ($99/year).

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

## API & Performance

- [ ] Streaming audio response (chunked transfer encoding)
- [ ] Concurrent generation queue (replace single `asyncio.Lock` with a worker pool)
- [ ] Server-sent events for real-time generation progress
