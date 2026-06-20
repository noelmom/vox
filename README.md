# Codename: Vox

A local, privacy-first text-to-speech (TTS) platform powered by [Chatterbox](https://github.com/resemble-ai/chatterbox) and optimised for Apple Silicon. Vox runs entirely on your machine — no cloud, no subscriptions, no data leaving your device.

It exposes a clean REST API and a web UI for generating high-quality audio from named voice profiles. The long-term goal is a one-click macOS app with a native menu bar helper.

---

## Features

- **Apple Silicon MPS acceleration** — Chatterbox runs on the Metal Performance Shaders backend for fast on-device inference
- **Voice profiles** — store named voices with reference audio and per-voice TTS defaults
- **Smart presets** — `default`, `youtube`, `hype`, `news` with full per-request parameter overrides
- **Flexible audio ingest** — upload `.wav`, `.m4a`, `.mp3`, `.aiff`, `.flac`, or `.ogg`; all converted to WAV automatically
- **Input folder watcher** — drop a voice recording into `input/` and it registers itself automatically
- **Job history** — every generation is logged to SQLite with timing, RTF, and output path
- **Request ID tracing** — `X-Request-ID` on every request and response, tied to DB records and logs for easy HAR-file debugging
- **Configurable cleanup** — generated output files are pruned on a TTL schedule
- **Zero cloud dependency** — fully self-hosted
- **Web UI** — single-page app for generating audio, managing voices, viewing history, and configuring settings
- **In-browser voice recording** — capture microphone audio directly in the browser with live waveform visualisation
- **Voice profile editing** — update description, tags, and TTS defaults without re-uploading audio
- **Tag system** — tag voices (`uploaded`, `auto-import`, or custom) with filter pills on the Voices screen
- **Custom tone** — "✦ Custom" pill opens a parameter panel with sliders for all 6 TTS params; persists via `localStorage`
- **Generation ETA** — progress bar with elapsed/remaining time estimate while TTS is running
- **Real upload progress** — live byte-count progress bar during voice file uploads

---

## Architecture

```
codename-vox/
├── api/
│   ├── main.py                  # FastAPI app, lifespan, middleware registration
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
│   │   ├── tts.py               # POST /tts — generate audio
│   │   ├── voices.py            # CRUD /voices — manage voice profiles
│   │   └── jobs.py              # GET /jobs — generation history
│   └── models/
│       ├── voice.py             # VoiceOut, VoiceParams, VoiceCreate schemas
│       └── job.py               # JobOut schema
├── ui/
│   ├── app.html                 # Single-page web UI (vanilla JS, ES modules)
│   ├── css/
│   │   └── vox.css              # Design tokens and component styles
│   └── js/
│       └── api.js               # Thin fetch/XHR wrappers for every API endpoint
├── working-poc/                 # Original proof-of-concept (reference only)
├── voices/                      # Stored voice profile WAV files
├── outputs/                     # Generated audio files (auto-cleaned by TTL)
├── input/                       # Drop audio files here for auto-ingest
│   └── processed/               # Files moved here after successful ingest
├── setup.sh                     # One-shot bootstrap script
├── run.sh                       # Start the server
├── requirements.txt             # Python dependencies
├── CHANGELOG.md                 # Notable changes per version
└── .env                         # Local config overrides (git-ignored)
```

---

## Quick Start

### Requirements

- macOS 13 Ventura or later
- Apple Silicon (M1 / M2 / M3 / M4) — x86 will fall back to CPU mode
- Internet connection for first-time setup (Homebrew, Python, model weights)

### 1. Clone

```bash
git clone git@github.com:MeloLabDev/codename-vox.git
cd codename-vox
```

### 2. Run setup

```bash
bash setup.sh
```

This single command:

| Step | What it does |
|------|-------------|
| Homebrew | Installs if not present |
| ffmpeg | `brew install ffmpeg` — handles all audio conversion |
| Python 3.11 | `brew install python@3.11` — preferred for torch/Chatterbox stability |
| Virtual environment | Creates `.venv/` inside the project |
| pip dependencies | Installs everything from `requirements.txt` |
| Runtime directories | Creates `voices/`, `outputs/`, `input/`, `input/processed/` |
| `.env` scaffold | Writes a commented config file with all available options |

### 3. Start the server

```bash
bash run.sh
```

The server starts on `http://0.0.0.0:8000` by default — reachable from any device on your local network. Open `http://localhost:8000/docs` for the interactive API docs.

> **Note for future packaging:** When Vox ships as a macOS `.app`, `VOX_HOST` should default to `127.0.0.1` (localhost only). Change the default in `api/core/config.py` and `run.sh` at that point. For now, `0.0.0.0` is intentional so you can test from phones, tablets, and other machines without extra config.

---

## API Reference

All responses include an `X-Request-ID` header. This ID is also stored in the `jobs` table in SQLite, making it trivial to correlate HAR files, server logs, and DB records when debugging.

You can supply your own request ID by passing `X-Request-ID` as a request header — Vox will honour it instead of generating one.

### Health

```
GET /
```

Returns server status, active device, presets list, and config summary.

```bash
curl http://localhost:8000/
```

---

### TTS — Generate Audio

```
POST /tts
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | ✓ | — | Text to synthesise |
| `preset` | string | | `default` | `default` \| `youtube` \| `hype` \| `news` |
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

**Response headers:**

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Unique ID for this request — matches the DB job record |
| `X-Preset` | Preset used |
| `X-Device` | Inference device (`mps` or `cpu`) |
| `X-Chunks` | Number of text chunks processed |
| `X-Audio-Duration-Seconds` | Length of generated audio |
| `X-Generation-Seconds` | Time spent in Chatterbox inference |
| `X-Total-Seconds` | Total request time including encoding |
| `X-RTF` | Real-time factor (generation time / audio duration, lower is faster) |
| `X-MP3-Encode-Seconds` | ffmpeg encode time (MP3 only) |

**Examples:**

```bash
# Generate WAV with a stored voice profile
curl -X POST http://localhost:8000/tts \
  -F "text=Hello, this is Vox speaking." \
  -F "preset=default" \
  -F "voice_name=noelmo-normal" \
  --output output.wav

# Generate MP3 with the hype preset
curl -X POST http://localhost:8000/tts \
  -F "text=This is going to be huge!" \
  -F "preset=hype" \
  -F "output_format=mp3" \
  --output output.mp3

# Upload a voice file inline (M4A from iPhone Voice Memos)
curl -X POST http://localhost:8000/tts \
  -F "text=Testing my own voice clone." \
  -F "voice=@/path/to/recording.m4a" \
  --output output.wav

# Override individual params
curl -X POST http://localhost:8000/tts \
  -F "text=Calm and measured delivery." \
  -F "preset=news" \
  -F "exaggeration=0.1" \
  -F "cfg_weight=0.8" \
  --output output.wav

# Supply your own request ID for tracing
curl -X POST http://localhost:8000/tts \
  -H "X-Request-ID: my-trace-id-001" \
  -F "text=Traceable request." \
  --output output.wav
```

---

### Voices — Manage Voice Profiles

Voice profiles store a reference WAV file plus optional TTS parameter defaults. When a voice is used in `/tts`, its stored defaults sit between the preset and any per-request overrides.

```
GET    /voices              List all voice profiles
GET    /voices/{name}       Get a single voice profile
POST   /voices              Upload and register a voice
PATCH  /voices/{name}       Update description or TTS defaults (no re-upload needed)
DELETE /voices/{name}       Delete voice profile and its WAV file
```

**Upload a voice (WAV, M4A, MP3, AIFF, FLAC, OGG accepted):**

```bash
curl -X POST http://localhost:8000/voices \
  -F "name=my-voice" \
  -F "description=Calm narrator, recorded in quiet room" \
  -F "exaggeration=0.4" \
  -F "cfg_weight=0.6" \
  -F "file=@/path/to/recording.m4a"
```

Non-WAV files are automatically converted to 16-bit 44.1 kHz mono WAV on ingest. The original filename is preserved in the DB.

**Update TTS defaults without re-uploading:**

```bash
curl -X PATCH http://localhost:8000/voices/my-voice \
  -F "exaggeration=0.6" \
  -F "description=Updated description"
```

**Drop-folder ingest:**

Any audio file placed in the `input/` folder is automatically detected (polled every 10 seconds), converted to WAV, and registered as a voice profile using the filename stem as the voice name. The original file is moved to `input/processed/` on success.

```bash
# Example: iPhone Voice Memo dropped into input/
cp ~/Downloads/Voice\ Memo.m4a ./input/my-voice.m4a
# → voice "my-voice" appears in /voices within 10 seconds
```

---

### Jobs — Generation History

```
GET /jobs                   List recent jobs (newest first)
GET /jobs/{request_id}      Get a specific job by request ID
```

```bash
# List last 50 jobs
curl http://localhost:8000/jobs

# Look up a specific job
curl http://localhost:8000/jobs/abc123-...

# Paginate
curl "http://localhost:8000/jobs?limit=20&offset=40"
```

Job fields include: `status`, `text`, `preset`, `output_path`, `chunks`, `audio_duration_s`, `generation_s`, `rtf`, `error`, `created_at`, `completed_at`.

---

### Presets

```
GET /presets                Return all preset definitions
```

Built-in presets:

| Preset | Character | Use case |
|--------|-----------|----------|
| `default` | Balanced | General purpose |
| `youtube` | Slightly expressive | Video narration |
| `hype` | High energy | Promos, trailers |
| `news` | Flat, authoritative | News reading, documentation |

---

## Configuration

All settings are controlled via environment variables with a `VOX_` prefix, or by editing `.env` in the project root. The `.env` file is git-ignored and created automatically by `setup.sh`.

| Variable | Default | Description |
|----------|---------|-------------|
| `VOX_HOST` | `0.0.0.0` | Bind address. Set to `127.0.0.1` to restrict to localhost. |
| `VOX_PORT` | `8000` | Port to listen on |
| `VOX_DEVICE` | `auto` | `auto` \| `mps` \| `cpu` |
| `VOX_FFMPEG_PATH` | `/opt/homebrew/bin/ffmpeg` | Path to ffmpeg binary |
| `VOX_OUTPUT_TTL_HOURS` | `24` | Hours to keep generated output files. `0` = keep forever. |
| `VOX_WATCHER_INTERVAL_S` | `10` | How often (seconds) the input folder is polled |
| `VOX_CLEANUP_INTERVAL_S` | `3600` | How often (seconds) the cleanup task runs |
| `VOX_DEFAULT_MAX_CHARS` | `450` | Default text chunk size |
| `VOX_MIN_MAX_CHARS` | `100` | Minimum allowed chunk size |
| `VOX_MAX_MAX_CHARS` | `3000` | Maximum allowed chunk size |
| `HF_TOKEN` | *(none)* | HuggingFace access token. Optional but recommended — enables authenticated downloads for faster transfer rates and access to gated models. Uses the standard HF convention (no `VOX_` prefix). Generate a read-only token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). **Never commit this value to git.** |

**Example `.env`:**

```env
VOX_HOST=0.0.0.0
VOX_PORT=8000
VOX_OUTPUT_TTL_HOURS=48
VOX_DEVICE=mps
```

---

## Debugging & Tracing

Every request gets a `X-Request-ID` (UUID4) attached to:
- The HTTP response header
- The `jobs` table row in `vox.db`
- Every log line emitted during that request

This means you can:
1. Grab a `X-Request-ID` from a HAR file or curl `-v` output
2. Query the DB: `SELECT * FROM jobs WHERE request_id = '<id>';`
3. Grep the logs: `grep '<id>' server.log`

To inspect the database directly:
```bash
sqlite3 vox.db
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
| Web UI | Vanilla JS (ES modules), single `app.html` SPA |
| Packaging | *(coming soon — PyInstaller or py2app)* |
| Menu bar helper | *(coming soon — rumps or PyObjC)* |

---

## Roadmap

- [x] Chatterbox engine wrapper with MPS/CPU auto-detect
- [x] FastAPI backend with async generation lock
- [x] Built-in presets with per-request param overrides
- [x] Long-text chunking with sentence-boundary splitting
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
- [x] Web UI — Generate, Voices, History, Settings screens
- [x] Voice profile tagging and filter pills
- [x] Voice profile editing modal
- [x] In-browser microphone recording with waveform visualiser
- [x] Custom tone panel (per-request TTS parameter overrides, localStorage persistence)
- [x] Generation ETA progress bar
- [x] Real upload progress (XHR byte-level)
- [ ] Streaming audio response (chunked transfer)
- [ ] Queue with concurrency support (multiple requests)
- [ ] macOS menu bar helper (start/stop server, view recent jobs)
- [ ] One-click `.app` packaging (PyInstaller / py2app)
- [ ] Auto-launch on login
- [ ] Public release polish (installer, docs site, demo)

---

## Contributing

This project is currently in active private development. Public contribution guidelines will be added before the public release.

---

## License

TBD — to be determined before public release.
