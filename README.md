# Vox

[![CI](https://github.com/noelmom/vox/actions/workflows/ci.yml/badge.svg?branch=development)](https://github.com/noelmom/vox/actions/workflows/ci.yml)
![macOS](https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white)
![Apple Silicon](https://img.shields.io/badge/Apple%20Silicon-M1%2B-0A84FF?logo=apple&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=061018)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Swift](https://img.shields.io/badge/Swift-AppKit-F05138?logo=swift&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![On Device](https://img.shields.io/badge/AI-on--device-00A67E)

A local, privacy-first text-to-speech (TTS) platform powered by [Chatterbox](https://github.com/resemble-ai/chatterbox) and optimised for Apple Silicon. Vox runs entirely on your machine — no cloud, no subscriptions, no data leaving your device.

It exposes a clean REST API and a web UI for generating high-quality audio from named voice profiles. The long-term goal is a one-click macOS app with a native menu bar helper.

---

## Features

- **Apple Silicon MPS acceleration** — Chatterbox runs on the Metal Performance Shaders backend for fast on-device inference
- **Voice profiles** — store named voices with reference audio and per-voice TTS defaults
- **Smart presets** — built-in tones like `confident`, `calm`, `newsreader`, and `storyteller` with full per-request parameter overrides
- **Flexible audio ingest** — upload `.wav`, `.m4a`, `.mp3`, `.aiff`, `.flac`, `.ogg`, or `.webm`; all converted to WAV automatically
- **Input folder watcher** — drop a voice recording into `input/` and it registers itself automatically
- **Job history** — every generation is logged to SQLite with timing, RTF, and output path
- **Request ID tracing** — `X-Request-ID` on every request and response, tied to DB records and logs for easy HAR-file debugging
- **Configurable cleanup** — generated output files are pruned on a TTL schedule
- **Zero cloud dependency** — fully self-hosted
- **Web UI** — single-page app for generating audio, managing voices, viewing history, and configuring settings
- **In-browser voice recording** — capture microphone audio directly in the browser with live waveform visualisation
- **Audio player with synchronized waveform** — generated audio plays inline with a waveform display that fills as playback progresses and stays synchronized when seeking
- **Voice profile editing** — update description, tags, and TTS defaults without re-uploading audio
- **Tag system** — tag voices (`uploaded`, `auto-import`, or custom) with filter pills on the Voices screen
- **Custom tone** — "✦ Custom" pill opens a parameter panel with sliders for all 6 TTS params; persists via `localStorage`
- **Generation status** — global and Create-page indicators for queued/running jobs, with elapsed time, SSE updates, polling fallback, and cancel controls
- **Backup & restore** — export/import SQLite history and voice assets from Settings
- **Theme preference** — v1 uses light mode only; dark-mode plumbing is deferred for post-v1 polish
- **Real upload progress** — live byte-count progress bar during voice file uploads
- **macOS menu bar helper** — monochrome VOX status icon, CPU %, RAM, Start/Stop/Restart, Open in Browser, Copy Address — auto-starts on login
- **LaunchAgent management** — server and helper managed by macOS launchd; crash-restart, structured logs to `~/Library/Logs/Vox/`

---

## Screenshots

| Create | Library |
| --- | --- |
| ![Vox Studio Create tab with script editor and Voice Studio controls](docs/screenshots/create.jpg) | ![Vox Studio Library tab with microphone status and voice profile cards](docs/screenshots/library.jpg) |

| Recordings | Settings |
| --- | --- |
| ![Vox Studio Recordings tab with waveform playback and regeneration controls](docs/screenshots/recordings.jpg) | ![Vox Studio Settings tab with runtime, stability mode, and network access controls](docs/screenshots/settings.jpg) |

---

## Architecture

```
vox/
├── api/
│   ├── main.py                  # FastAPI app, lifespan, SPA routing, settings endpoint
│   ├── middleware/
│   │   └── request_id.py        # Attaches X-Request-ID to every req/res
│   ├── core/
│   │   ├── config.py            # All settings via VOX_ env vars or .env file
│   │   ├── db.py                # aiosqlite connection, schema migrations
│   │   ├── engine.py            # Chatterbox model loader, MPS/CPU auto-detect
│   │   ├── presets.py           # Built-in TTS preset definitions
│   │   ├── chunker.py           # Long-text sentence splitting logic
│   │   ├── audio.py             # ffmpeg helpers: WAV conversion + MP3 export
│   │   ├── watcher.py           # Background task: watches input/ folder
│   │   ├── cleanup.py           # Background task: TTL-based output file pruning
│   │   └── logger.py            # Structured logging with request_id context
│   ├── routers/
│   │   ├── tts.py               # POST /api/v1/tts — async generation (202 Accepted)
│   │   ├── voices.py            # CRUD /api/v1/voices — manage voice profiles
│   │   ├── jobs.py              # GET /api/v1/jobs — history, status, audio download
│   │   ├── logs.py              # GET /api/v1/logs — structured job diagnostics + bounded log tails
│   │   ├── alerts.py            # GET /api/v1/alerts — install/runtime warning banners
│   │   └── presets.py           # GET /api/v1/presets — built-in + custom tone definitions
│   └── models/
│       ├── voice.py             # VoiceOut, VoiceParams, VoiceCreate schemas
│       └── job.py               # JobOut schema
├── VERSION                      # Studio/native release version used by build scripts
├── build_info.json              # Stamped version, commit, and build time copied into installs
├── ui-src/                      # React SPA source (Vite + TypeScript + Tailwind v4)
│   ├── src/
│   │   ├── routes/              # TanStack Router file-based routes
│   │   │   ├── index.tsx        # Local installed welcome page
│   │   │   ├── app.tsx          # Shell layout — sidebar, header, footer
│   │   │   ├── app.index.tsx    # Create page (TTS generation)
│   │   │   ├── app.library.tsx  # Library page (voice profile management)
│   │   │   ├── app.recordings.tsx # Recordings page (job history)
│   │   │   └── app.settings.tsx # Settings page
│   │   ├── lib/
│   │   │   └── api.ts           # Typed fetch wrappers for every API endpoint
│   │   ├── components/ui/       # shadcn/ui primitives
│   │   └── assets/              # Logos, icons, screenshots
│   ├── public/                  # Static assets (favicon, etc.)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── ui-dist/                     # Production build output (served by FastAPI)
├── public-site/                 # GitHub Pages marketing/download page
│   ├── index.html               # SEO-optimized public landing page
│   └── agents/SKILL.md          # Local REST API integration guide for AI agents
├── design-inspiration/          # Archived landing references and future sketches
├── voices/                      # Stored voice profile WAV files
├── outputs/                     # Generated audio files (auto-cleaned by TTL)
├── input/                       # Drop audio files here for auto-ingest
│   └── processed/               # Files moved here after successful ingest
├── voxhelper/
│   ├── main.swift               # Entry point, single-instance lock
│   ├── AppDelegate.swift        # NSApplicationDelegate lifecycle
│   ├── StatusBarController.swift # NSStatusItem, menu, all actions
│   └── ServerMonitor.swift      # Health check, .env reader, CPU/RAM stats, launchctl
├── launchagent/
│   ├── com.noelmom.vox.plist         # Server LaunchAgent template (manual start)
│   └── com.noelmom.vox-helper.plist  # Helper LaunchAgent template (auto on login)
├── scripts/
│   ├── run.sh                   # Manual foreground start (troubleshooting / dev)
│   ├── build-apps.sh            # Build, sign, and package VoxHelper + VoxServer DMG
│   ├── build-pkg.sh             # Build, sign, notarize, and staple the one-click installer package
│   ├── release.sh               # Unified release: version, build, notarize, tag, upload
│   ├── write-build-info.sh      # Stamp VERSION + git commit + UTC build time
│   ├── install-agent.sh         # Register server LaunchAgent with macOS launchd
│   ├── uninstall-agent.sh       # Unload and remove the server LaunchAgent
│   ├── install-helper.sh        # Register menu bar helper LaunchAgent
│   ├── uninstall-helper.sh      # Unload and remove the helper LaunchAgent
│   ├── uninstall.sh             # Shared uninstall flow used by vox.sh and the helper
│   ├── update.sh                # Pull latest + sync deps + re-register agents
│   └── README.md                # Script reference + manual start guide
├── setup.sh                     # One-shot bootstrap script
├── vox.sh                       # Unified CLI — install, update, uninstall
├── AGENTS.md                    # Maintainer/AI-agent operating procedures
├── requirements.txt             # Python dependencies
├── requirements-dev.txt         # Python test/lint dependencies
├── requirements-ci.txt          # Lightweight backend deps for CI tests
├── pyproject.toml               # Pytest + Ruff configuration
├── tests/                       # Baseline backend tests
├── .github/workflows/ci.yml     # GitHub Actions CI
├── CHANGELOG.md                 # Notable changes per version
└── .env                         # Local config overrides (git-ignored)
```

---

## Quick Start

### Requirements

- macOS 13 Ventura or later
- Apple Silicon (M1 or later) — Intel Macs are not supported
- Xcode Command Line Tools / git (`xcode-select --install`) for clone-based installs and updates
- Internet connection for first-time setup (Homebrew, Python, model weights)

### 1. Clone

```bash
git clone git@github.com:noelmom/vox.git
cd vox
```

### 2. Install

```bash
bash vox.sh install
```

The installer walks you through everything interactively:

| Step | What it does |
|------|-------------|
| Homebrew | Installs if not present |
| ffmpeg | `brew install ffmpeg` — handles all audio conversion |
| Python 3.11 | `brew install python@3.11` — preferred for torch/Chatterbox stability |
| Virtual environment | Creates venv in `~/Library/Application Support/Vox/` |
| pip dependencies | Installs everything from `requirements.txt` |
| Runtime directories | Creates `voices/`, `outputs/`, `input/`, `data/` |
| `.env` scaffold | Writes a commented config file with all available options |
| HF token prompt | Optional — speeds up model downloads |
| LaunchAgents | Registers the server agent and menu bar helper |
| First-run welcome | The signed `.pkg` opens the local Welcome page after bootstrap completes |

**Non-interactive install** (CI or scripted):
```bash
bash vox.sh install --yes                        # skip all prompts
bash vox.sh install --yes --token hf_xxx         # also set HF token
```

> `.env` is git-ignored and never committed. Keep your token out of any other files.

The **VOX icon** appears in your menu bar within a few seconds. Use it to start, stop, and restart the server, open the web UI, monitor CPU/RAM/GPU, and confirm the installed Studio/helper build versions.

### 3. Start the server

Vox starts the server automatically on login by default. You can disable that from the Vox Helper menu if you prefer to start it manually.

**Via the menu bar:** click the Vox icon → **Start Server**.

**Via terminal:**

```bash
launchctl kickstart gui/$(id -u)/com.noelmom.vox          # start
launchctl stop gui/$(id -u)/com.noelmom.vox               # stop
launchctl kickstart -k gui/$(id -u)/com.noelmom.vox       # restart
tail -f ~/Library/Logs/Vox/vox.log                           # live logs
```

The menu bar helper shows `localhost:8000 · local only` when `VOX_HOST=127.0.0.1` (default), or `192.168.x.x:8000 · network accessible` when `VOX_HOST=0.0.0.0` — so you always know at a glance who can reach the server.

### 4. Updating

```bash
bash vox.sh update
```
Pulls the latest from your current branch, syncs pip dependencies, and re-registers both LaunchAgents in one step.

**If you downloaded a zip instead of cloning:**
```bash
bash vox.sh update --zip /path/to/extracted-vox-folder
```
Your `.env`, `voices/`, `data/`, and `outputs/` are always preserved — only app files are replaced.

### 5. Uninstalling

```bash
bash vox.sh uninstall               # remove agents, keep data
bash vox.sh uninstall --purge       # remove everything including voices and outputs
bash vox.sh uninstall --yes --purge # no confirmation prompts
```

---

**Option B — manual start (troubleshooting / development):**

```bash
bash scripts/run.sh
```

Use this when the LaunchAgent isn't installed, you're debugging a startup crash and want live terminal output, or `launchctl` isn't responding and you need to rule out the agent itself. Stop the LaunchAgent first to avoid a port conflict:

```bash
launchctl stop gui/$(id -u)/com.noelmom.vox
bash scripts/run.sh
```

See [`scripts/README.md`](scripts/README.md) for a full reference of all scripts.

The server starts on `http://127.0.0.1:8000` by default — local to the Mac running Vox. Open `http://localhost:8000/app` for the web UI or `http://localhost:8000/docs` for the interactive API docs.

To allow phones, tablets, or other machines on your LAN to reach Vox, open Settings → Runtime → Network access and switch to **Network accessible**. Restart the local server for the host change to take effect.

---

## API Reference

All responses include an `X-Request-ID` header. This ID is also stored in the `jobs` table in SQLite, making it trivial to correlate HAR files, server logs, and DB records when debugging.

You can supply your own request ID by passing `X-Request-ID` as a request header — Vox will honour it instead of generating one.

### Health

```
GET /health
```

Returns a shallow liveness check (`{"status":"ok"}`). Use this for health polling — it is not versioned and always available.

```bash
curl http://localhost:8000/health
```

---

### TTS — Generate Audio

Generation is **asynchronous**. `POST /api/v1/tts` returns `202 Accepted` immediately with a `request_id`. Poll `GET /api/v1/jobs/{request_id}` until `status` is `completed`, `failed`, or `cancelled`, then download completed audio from `GET /api/v1/jobs/{request_id}/audio`.

```
POST /api/v1/tts
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | ✓ | — | Text to synthesise |
| `preset` | string | | `default` | Built-in/user preset name. Built-ins include `confident`, `calm`, `soft-spoken`, `polite`, `enthusiastic`, `dramatic`, `angry`, `sarcastic`, `newsreader`, `storyteller`, and legacy `default`. |
| `output_format` | string | | `mp3` | `mp3` \| `wav` |
| `voice_name` | string | | — | Name of a stored voice profile |
| `voice` | file | | — | Upload a reference audio file directly (WAV, M4A, MP3, etc.) |
| `max_chars` | int | | 450 | Max chars per chunk (100–3000) |
| `exaggeration` | float | | preset | Override exaggeration |
| `cfg_weight` | float | | preset | Override CFG weight |
| `temperature` | float | | preset | Override temperature |
| `repetition_penalty` | float | | preset | Override repetition penalty |
| `top_p` | float | | preset | Override top-p |
| `min_p` | float | | preset | Override min-p |

**Parameter precedence:** `preset defaults → voice profile defaults → request overrides`

**202 response body:**

```json
{ "request_id": "abc123-..." }
```

Listen to `GET /api/v1/jobs/{request_id}/events` for server-sent job updates, or poll `GET /api/v1/jobs/{request_id}` as a fallback. Once `status` is `completed`, fetch `GET /api/v1/jobs/{request_id}/audio` to download the file. Jobs are serialized through a single local model lock; if another generation is active, new jobs remain `queued` until the engine is free.

**Response headers (on the 202):**

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Unique ID for this request — matches the DB job record |

**Examples:**

```bash
# Queue a generation with a stored voice profile
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Hello, this is Vox speaking." \
  -F "preset=default" \
  -F "voice_name=noelmo-normal"
# → { "request_id": "abc123-..." }

# Poll until completed, then download
curl http://localhost:8000/api/v1/jobs/abc123-...          # check status
curl http://localhost:8000/api/v1/jobs/abc123-.../audio \  # download when completed
  --output output.mp3

# Generate with the enthusiastic preset
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=This is going to be huge!" \
  -F "preset=enthusiastic" \
  -F "output_format=mp3"

# Upload a voice file inline (M4A from iPhone Voice Memos)
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Testing my own voice clone." \
  -F "voice=@/path/to/recording.m4a"

# Override individual params
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Calm and measured delivery." \
  -F "preset=newsreader" \
  -F "exaggeration=0.1" \
  -F "cfg_weight=0.8"

# Supply your own request ID for tracing
curl -X POST http://localhost:8000/api/v1/tts \
  -H "X-Request-ID: my-trace-id-001" \
  -F "text=Traceable request."
```

---

### Voices — Manage Voice Profiles

Voice profiles store a reference WAV file plus optional TTS parameter defaults. When a voice is used in `/api/v1/tts`, its stored defaults sit between the preset and any per-request overrides.

```
GET    /api/v1/voices              List all voice profiles
GET    /api/v1/voices/{name}       Get a single voice profile (includes file_available bool)
POST   /api/v1/voices              Upload and register a voice
PATCH  /api/v1/voices/{name}       Update description or TTS defaults (no re-upload needed)
DELETE /api/v1/voices/{name}       Delete voice profile and its WAV file
```

**Upload a voice (WAV, M4A, MP3, AIFF, FLAC, OGG, WebM accepted):**

```bash
curl -X POST http://localhost:8000/api/v1/voices \
  -F "name=my-voice" \
  -F "description=Calm narrator, recorded in quiet room" \
  -F "exaggeration=0.4" \
  -F "cfg_weight=0.6" \
  -F "file=@/path/to/recording.m4a"
```

Non-WAV files are automatically converted to 16-bit 44.1 kHz mono WAV on ingest. The original filename is preserved in the DB.

**Update TTS defaults without re-uploading:**

```bash
curl -X PATCH http://localhost:8000/api/v1/voices/my-voice \
  -F "exaggeration=0.6" \
  -F "description=Updated description"
```

**Drop-folder ingest:**

Any audio file placed in the `input/` folder is automatically detected (polled every 10 seconds), converted to WAV, and registered as a voice profile using the filename stem as the voice name. The original file is moved to `input/processed/` on success. Accepted formats: WAV, M4A, MP3, AIFF, FLAC, OGG, WebM.

```bash
# Example: iPhone Voice Memo dropped into input/
cp ~/Downloads/Voice\ Memo.m4a ./input/my-voice.m4a
# → voice "my-voice" appears in /api/v1/voices within 10 seconds
```

---

### Jobs — Generation History & Audio Download

```
GET /api/v1/jobs                          List recent jobs (newest first)
GET /api/v1/jobs/{request_id}             Get a specific job (includes file_available bool)
GET /api/v1/jobs/{request_id}/events      Stream job status events
GET /api/v1/jobs/{request_id}/audio       Download the generated audio file
POST /api/v1/tts/{request_id}/cancel      Cancel a queued/running generation
DELETE /api/v1/jobs/{request_id}          Delete a job row and its generated file
GET /api/v1/backups/export                Download DB + voice backup zip
POST /api/v1/backups/restore              Restore DB + voice backup zip
```

```bash
# List last 50 jobs
curl http://localhost:8000/api/v1/jobs

# Poll a specific job until completed
curl http://localhost:8000/api/v1/jobs/abc123-...

# Download audio once status == "completed"
curl http://localhost:8000/api/v1/jobs/abc123-.../audio --output output.mp3

# Cancel a queued/running generation
curl -X POST http://localhost:8000/api/v1/tts/abc123-.../cancel

# Paginate
curl "http://localhost:8000/api/v1/jobs?limit=20&offset=40"
```

Job fields include: `request_id`, `status`, `text`, `voice_name`, `preset`, `output_format`, `output_path`, `file_available`, `chunks`, `audio_duration_s`, `generation_s`, `total_s`, `rtf`, `device`, `error`, `created_at`, `completed_at`.

---

### Presets

```
GET /api/v1/presets         Return all preset definitions (built-in + user-saved)
```

Built-in presets:

| Preset | Character | Use case |
|--------|-----------|----------|
| `confident` / `default` | Balanced | General purpose |
| `calm` | Low-key | Measured narration |
| `soft-spoken` | Gentle | Quiet reads and softer delivery |
| `polite` | Clear | Helpful assistant-style reads |
| `enthusiastic` | High energy | Promos, upbeat narration |
| `dramatic` | Expressive | Story beats and trailers |
| `angry` | Intense | Stylized emotional takes |
| `sarcastic` | Dry | Wry or comedic delivery |
| `newsreader` | Flat, authoritative | News reading, documentation |
| `storyteller` | Warm, expressive | Narrative scripts |

---

## Configuration

All settings are controlled via environment variables with a `VOX_` prefix, or by editing `.env` in the project root. Start from [`.env.example`](./.env.example) and copy it to `.env` if you want a ready-made template. The `.env` file is git-ignored and created automatically by `setup.sh`.

| Variable | Default | Description |
|----------|---------|-------------|
| `VOX_HOST` | `127.0.0.1` | Bind address. Use `127.0.0.1` for local-only access or `0.0.0.0` for LAN access. Host changes require restarting the local server. |
| `VOX_PORT` | `8000` | Port to listen on |
| `VOX_DEVICE` | `auto` | `auto` \| `mps` \| `cpu` |
| `VOX_FFMPEG_PATH` | `/opt/homebrew/bin/ffmpeg` | Path to ffmpeg binary |
| `VOX_OUTPUT_TTL_HOURS` | `24` | Hours to keep generated output files. `0` = keep forever. |
| `VOX_WATCHER_INTERVAL_S` | `10` | How often (seconds) the input folder is polled |
| `VOX_CLEANUP_INTERVAL_S` | `3600` | How often (seconds) the cleanup task runs |
| `VOX_DEFAULT_MAX_CHARS` | `450` | Default hard maximum characters per generation chunk when an API request does not pass `max_chars`. Editable in Settings as **Default per-chunk max**. |
| `VOX_MIN_MAX_CHARS` | `100` | Minimum allowed per-request `max_chars` value |
| `VOX_MAX_MAX_CHARS` | `3000` | Maximum allowed per-request `max_chars` value |
| `VOX_CHUNK_HEADROOM_CHARS` | `40` | Buffer subtracted from the per-chunk max when Vox packs sentences. Example: `450 - 40 = ~410` character soft packing target. Invalid or empty values fall back to 40. |
| `VOX_MAX_VOICE_CLIP_DURATION_S` | `120` | Maximum allowed uploaded/recorded voice clip length in seconds. Invalid or empty values fall back to 120. |
| `HF_TOKEN` | *(none)* | HuggingFace access token. Only needed the first time the model is downloaded — without it, downloads are anonymous and subject to HuggingFace rate limits. Has no effect on generation speed once the model is cached locally. Uses the standard HF convention (no `VOX_` prefix). Generate a read-only token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). **Never commit this value to git.** |

> **Note:** The menu bar helper (`VoxHelper.app`) reads `.env` on startup and uses the configured `VOX_PORT` for all health checks and API calls. If you change `VOX_PORT`, restart the helper for the change to take effect.

**Example `.env`:**

```env
VOX_HOST=127.0.0.1
VOX_PORT=8000
VOX_OUTPUT_TTL_HOURS=48
VOX_DEFAULT_MAX_CHARS=450
VOX_CHUNK_HEADROOM_CHARS=40
VOX_MAX_VOICE_CLIP_DURATION_S=120
VOX_DEVICE=mps
HF_TOKEN=hf_xxxxxxxxxxxxx
```

The same template lives in [`.env.example`](./.env.example) for easy copying and reference.

---

## Debugging & Tracing

Every request gets a `X-Request-ID` (UUID4) attached to:
- The HTTP response header
- The `jobs` table row in `vox.db`
- Every log line emitted during that request

This means you can:
1. Grab a `X-Request-ID` from a HAR file or curl `-v` output
2. Query the DB: `SELECT * FROM jobs WHERE request_id = '<id>';`
3. Grep the logs: `grep '<id>' ~/Library/Logs/Vox/vox.log`

To inspect the database directly:
```bash
sqlite3 ~/Library/Application\ Support/Vox/data/vox.db
> SELECT request_id, status, preset, audio_duration_s, rtf, created_at FROM jobs ORDER BY created_at DESC LIMIT 10;
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| TTS Engine | [Chatterbox](https://github.com/resemble-ai/chatterbox) |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn |
| Acceleration | Apple MPS (Metal Performance Shaders) |
| Database | SQLite via [aiosqlite](https://github.com/omnilib/aiosqlite) |
| Audio conversion | ffmpeg |
| Job queue | `asyncio.Lock` (single-device serialisation) |
| Settings | [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) |
| Web UI | React 19 + TypeScript, Vite 6, Tailwind CSS v4, TanStack Router + Query |
| Menu bar helper | Native Swift (AppKit `NSStatusItem`) — arm64 macOS only |
| Process management | macOS launchd via LaunchAgent plists |
| Packaging | Signed/notarized macOS `.dmg` and `.pkg` via `scripts/build-apps.sh`, `scripts/build-pkg.sh`, and `scripts/release.sh` |
| CI | GitHub Actions: Ruff, codespell, pytest, TypeScript typecheck, Vite build, shell syntax |

---

## Roadmap

Vox is now in a v1.0 scope freeze: only bug fixes, product polish, and true blockers should be added before v1.0. New features below are post-v1 unless they become release blockers.

- [x] Chatterbox engine wrapper with MPS/CPU auto-detect
- [x] FastAPI backend with async generation lock
- [x] Built-in presets with per-request param overrides
- [x] Long-text chunking with sentence-boundary splitting and medium-script sentence packing
- [x] WAV and MP3 output via ffmpeg
- [x] Voice profile management with SQLite registry
- [x] Per-voice TTS parameter defaults
- [x] Multi-format audio ingest (M4A, MP3, AIFF, FLAC, OGG → WAV)
- [x] Input folder auto-watcher
- [x] Job history with full timing metrics
- [x] X-Request-ID tracing across HTTP, DB, and logs
- [x] TTL-based output file cleanup
- [x] Environment-based configuration
- [x] One-command setup script (`setup.sh`)
- [x] Web UI — Create, Library, Recordings, Settings screens (React SPA)
- [x] Voice profile tagging, filter pills, and search
- [x] Voice profile editing — display name, description, tags, custom icon
- [x] Favorites — starred voices persist in SQLite, survive restarts and device changes
- [x] In-browser microphone recording with live waveform
- [x] Voice profile audio preview player with seek and volume
- [x] Custom tone panel — per-request TTS parameter sliders, named presets saved to DB
- [x] Custom tone update/save-as flow for saved user presets
- [x] Sidebar widgets — lifetime and daily request/audio-minutes stats with sparklines
- [x] Generation status — queued/running state, elapsed timer, SSE updates, polling fallback, global status bar, and cancel controls
- [x] Backup & restore — export/import SQLite history and voice assets from Settings
- [x] Theme preference plumbing — light mode enforced for v1; dark/system plumbing deferred for post-v1 polish
- [x] Result download with format and quality controls
- [x] Recent recordings with inline play, download, and delete
- [x] Persistent generation error UI with retry/dismiss and request ID copy
- [x] macOS menu bar helper (native Swift) — monochrome VOX status icon, CPU/RAM, server control, copy address
- [x] LaunchAgent for server (manual start, crash-restart, structured logs)
- [x] LaunchAgent for helper (auto-starts on login)
- [x] Swift menu bar rewrite — native AppKit, eliminates Python/PyObjC issues on macOS Sequoia
- [x] Real waveform coverage across audio-bearing surfaces (decoded peaks for fetched/recorded/uploaded audio; placeholders only for loading/decorative states)
- [x] Microphone error classification — distinct UI for no-device / access-denied / insecure context
- [ ] Post-v1: manual pause insertion in the Create script editor
- [ ] Post-v1: pronunciation dictionary / word replacement controls
- [ ] Post-v1: finish dark theme visual polish; the toggle and theme tokens are wired, but dark mode still needs minor contrast/surface tweaks before it is release-ready
- [ ] Post-v1: streaming audio response (chunked transfer)
- [ ] Post-v1: review Python and JavaScript SDK support after the local REST API stabilizes
- [ ] Post-v1: single self-contained `.app` packaging, separate from the current signed/notarized `.pkg` + `.dmg` release flow
- [x] Auto-launch on login — server and helper both auto-start by default; users can disable either from Vox Helper

---

## Contributing

This project is currently in active private development. Public contribution guidelines will be added before the public release.

---

## License

TBD — to be determined before public release.
