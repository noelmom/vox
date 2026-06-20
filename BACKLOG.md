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

- [ ] Voice upload and profile management
- [ ] Text input with preset selector
- [ ] Job history with audio playback
- [ ] Live generation status

---

## Packaging & Distribution

- [ ] macOS menu bar helper (start/stop server, view recent jobs, open UI)
- [ ] One-click `.app` packaging (PyInstaller or py2app)
- [ ] Auto-launch on login option
- [ ] Default `VOX_HOST` to `127.0.0.1` once packaged as a macOS app

---

## API & Performance

- [ ] Streaming audio response (chunked transfer encoding)
- [ ] Concurrent generation queue (replace single `asyncio.Lock` with a worker pool)
- [ ] Voice profile tagging and search
