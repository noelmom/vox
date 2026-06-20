# Backlog

Ideas and improvements to revisit. Not bugs — these are enhancements queued for later.

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

- [ ] Text input with preset selector
- [ ] Job history with audio playback
- [ ] Live generation status

- [ ] **In-browser voice profile recording**
  - Display a Vox calibration script (phonetically rich, ~30–60 seconds at relaxed pace) as a reading prompt on screen
  - Use `MediaRecorder` API + `getUserMedia` — no library needed, works in all modern browsers
  - UX flow: mic permission request → sample script displayed → Record button → live waveform visualizer (Web Audio API `AnalyserNode`) → Stop → playback preview → Name + submit
  - On submit, recorded blob is posted directly to the existing `POST /voices` endpoint — no new server-side work needed
  - ffmpeg already handles WebM/Opus → WAV conversion on ingest; just need to add `audio/webm` to `INGESTABLE_EXTENSIONS` in `api/core/audio.py`
  - **Edge cases to handle:**
    - Safari/iOS outputs a different container format — test separately
    - Low mic gain / background noise check before accepting (basic RMS level check in Web Audio API)
    - Re-record flow without page reload
  - **Calibration script:** needs to be written — phonetically diverse, natural cadence, no tongue twisters. Should feel like reading a short news segment. Draft and store as a constant so it can be tweaked without touching UI code.
  - **Effort estimate:** ~1 day for recording + upload flow; UX polish (waveform, countdown, re-record, gain check) is additional

- [ ] Voice upload and profile management (drag & drop + file picker fallback)

---

## macOS Menu Bar Helper

- [ ] **System stats overlay — GPU, CPU, memory at a glance**
  - Live metrics panel in the menu bar popover: GPU usage, CPU usage, and RAM — similar to iStatistica / Stats but purpose-built for Vox.
  - Should feel native macOS: SF Symbols, translucent material background, compact layout.
  - Show inference-specific context when a generation is running (e.g. MPS utilization spike, memory pressure).
  - Reference aesthetic: modern macOS utility apps like TopNotch, Stats, or usage.app — not the older "Windows task manager" style.

---

## Packaging & Distribution

- [ ] macOS menu bar helper (start/stop server, view recent jobs, open UI)
- [ ] One-click `.app` packaging (PyInstaller or py2app)
- [ ] Auto-launch on login option
- [ ] Default `VOX_HOST` to `127.0.0.1` once packaged as a macOS app

---

## Non-Verbal Cues

- [ ] **Non-verbal speech cue support**

  **Test results** (`youtube` preset, `noelmo-normal` voice, 2026-06-20):

  | Notation | Example | Result |
  |----------|---------|--------|
  | `*word*` | `*coughing*` | ❌ Says the word literally |
  | `*word word*` | `*cough cough*` | ❌ Says the words literally |
  | `(description)` | `(clears throat)` | ✅ Some effect observed |
  | `[description]` | `[clears throat]` | ✅ Some effect observed |
  | Natural ellipsis | `Uh... excuse me...` | ✅ Works — natural spoken hesitation |
  | Natural ellipsis | `Hmm... let me reset` | ✅ Works |
  | Standalone | `Ahem...` | ✅ Partial — produces a sound, not a full cough |
  | Descriptive prose | `Coughing softly...` | ⚠️ Uncertain — reads as narration |
  | Third-person | `He clears his throat.` | ⚠️ Likely reads literally |

  **Key findings:**
  - `*asterisk*` notation is read aloud verbatim — Chatterbox does not treat it as a stage direction
  - Bracket/paren notation `()` and `[]` appears to have more influence on prosody
  - Natural written hesitation (`Uh...`, `Hmm...`, `Ahem...`) is the most reliable approach
  - Explicit cough sounds are the hardest — the model says "coughing" rather than producing the sound

  **Next steps:**
  - Pre-process text before sending to Chatterbox: strip `*...*` wrappers, normalize to the best-performing notation
  - Build a cue dictionary mapping intent → best notation (e.g. `cough` → `Ahem...` or `[clears throat]`)
  - Investigate whether phoneme injection or SSML-like tags could force specific sounds
  - Consider generating non-verbal sounds as separate audio clips and splicing them in post (ffmpeg concat) for sounds the model can't produce natively

---

## Tone Profiles

- [ ] **Custom tone with parameter panel**
  - Add a "Custom" tone pill in the Generate toolbar that opens an inline panel
  - Panel exposes: `exaggeration`, `cfg_weight`, `temperature`, `repetition_penalty`, `top_p`, `min_p` as sliders/inputs
  - Users can save a custom tone as a named profile (stored in DB alongside presets)
  - Custom profiles appear as pills alongside built-in tones (default, youtube, hype, news)
  - Deletion allowed for any custom profile — built-in tones are protected and cannot be deleted
  - API side: new endpoints `POST /tones`, `DELETE /tones/{name}` backed by a `tones` table
  - Seeded built-in tones remain read-only (flagged with `is_builtin=1` in DB)

---

## History Table

- [ ] **Column visibility toggle** — let users show/hide columns (e.g. hide RTF, Duration) via a "Columns" dropdown. Persist preference in localStorage.
- [ ] **CSV export** — download the current filtered view as a CSV file. Button in the topbar actions next to Refresh.

---

## API & Performance

- [ ] Streaming audio response (chunked transfer encoding)
- [ ] Concurrent generation queue (replace single `asyncio.Lock` with a worker pool)
- [ ] Voice profile tagging and search
