# Bug Tracker

Bugs found during development and testing. Checked off once fixed and verified.

---

## Fixed

- [x] **`perth.PerthImplicitWatermarker` is `NoneType` — server crashes on startup**
  - **Symptom:** `TypeError: 'NoneType' object is not callable` at `self.watermarker = perth.PerthImplicitWatermarker()` during lifespan startup.
  - **Root cause:** `perth` uses `pkg_resources` internally, which was silently removed from `setuptools` in v80+. The import failed quietly, causing `PerthImplicitWatermarker` to be set to `None` in `perth/__init__.py`.
  - **Fix:** Pinned `setuptools<80` in `requirements.txt`. Ran `pip install "setuptools<80"` to downgrade the existing venv.
  - **Verified:** `perth.PerthImplicitWatermarker()` instantiates successfully; server reaches `Application startup complete`.

- [x] **`KeyError: 'request_id'` spam in logs from third-party libraries**
  - **Symptom:** Every log line emitted by `httpx`, `huggingface_hub`, and `diffusers` during model download produced a `--- Logging error ---` traceback with `ValueError: Formatting field not found in record: 'request_id'`.
  - **Root cause:** `setup_logging()` used `basicConfig` with a format string containing `%(request_id)s`. This format is applied globally, but `RequestIDFilter` (which injects `request_id` when missing) was only attached to loggers created via `get_logger()`, not to the root handler — so third-party loggers bypassed the filter.
  - **Fix:** Rewrote `setup_logging()` in `api/core/logger.py` to manually create a `StreamHandler`, attach `RequestIDFilter` directly to it, and set it on the root logger. All loggers now go through the filtered handler.
  - **Verified:** Server starts cleanly with no logging errors; third-party log lines emit with `request_id=-`.

---

## Open

*None currently.*
