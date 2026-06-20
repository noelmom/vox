import uuid

import aiosqlite

from api.core.config import settings

# Default voice profiles bundled with the project.
# Each entry is registered on first startup if not already in the DB.
# The WAV file must exist at voices/<filename>.
_SEED_VOICES = [
    {
        "name": "noelmo-normal",
        "filename": "noelmo-normal.wav",
        "description": "Default test voice — used to verify the stack is working end-to-end.",
    },
]

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    return _db


async def connect():
    global _db
    _db = await aiosqlite.connect(settings.db_path)
    _db.row_factory = aiosqlite.Row
    await _migrate(_db)
    await _seed(_db)


async def disconnect():
    if _db:
        await _db.close()


async def _migrate(db: aiosqlite.Connection):
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS voices (
            id                  TEXT PRIMARY KEY,
            name                TEXT UNIQUE NOT NULL,
            filename            TEXT NOT NULL,
            original_filename   TEXT,
            description         TEXT,
            -- per-voice default TTS params (NULL = use preset value)
            exaggeration        REAL,
            cfg_weight          REAL,
            temperature         REAL,
            repetition_penalty  REAL,
            top_p               REAL,
            min_p               REAL,
            created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS jobs (
            request_id          TEXT PRIMARY KEY,
            status              TEXT NOT NULL DEFAULT 'pending',
            text                TEXT NOT NULL,
            preset              TEXT NOT NULL,
            voice_id            TEXT REFERENCES voices(id),
            output_format       TEXT NOT NULL DEFAULT 'mp3',
            output_path         TEXT,
            chunks              INTEGER,
            audio_duration_s    REAL,
            generation_s        REAL,
            encode_s            REAL,
            total_s             REAL,
            rtf                 REAL,
            error               TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at        TEXT
        );

        CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
    """)
    # Additive migrations for columns added after initial release
    for col, ddl in [
        ("tags", "ALTER TABLE voices ADD COLUMN tags TEXT NOT NULL DEFAULT ''"),
    ]:
        try:
            await db.execute(ddl)
            await db.commit()
        except Exception:
            pass  # column already exists

    await db.commit()


async def _seed(db: aiosqlite.Connection):
    for voice in _SEED_VOICES:
        wav_path = settings.voice_dir / voice["filename"]
        if not wav_path.exists():
            continue

        async with db.execute("SELECT id FROM voices WHERE name = ?", (voice["name"],)) as cur:
            if await cur.fetchone():
                continue

        await db.execute(
            """INSERT INTO voices (id, name, filename, original_filename, description)
               VALUES (?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), voice["name"], voice["filename"], voice["filename"], voice["description"]),
        )

    await db.commit()
