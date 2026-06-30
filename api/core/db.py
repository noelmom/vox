import uuid

import aiosqlite

from api.core.config import settings
from api.models.voice import _serialize_tags

# Default voice profiles bundled with the project.
# Each entry is registered on first startup if not already in the DB.
# The WAV file must exist at voices/<filename>.
_SEED_VOICES = [
    {
        "name": "noelmo-demo",
        "filename": "noelmo-demo.wav",
        "description": "Default test voice — used to verify the stack is working end-to-end.",
        "tags": ["Demo", "Male"],
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
    await _fail_stale_jobs(_db)
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

        CREATE TABLE IF NOT EXISTS user_presets (
            name                TEXT PRIMARY KEY,
            temperature         REAL NOT NULL,
            exaggeration        REAL NOT NULL,
            cfg_weight          REAL NOT NULL,
            repetition_penalty  REAL NOT NULL,
            top_p               REAL NOT NULL,
            min_p               REAL NOT NULL,
            created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS meta (
            key                 TEXT PRIMARY KEY,
            value               TEXT NOT NULL,
            updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
            key                 TEXT PRIMARY KEY,
            value               TEXT NOT NULL,
            updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    # Additive migrations for columns added after initial release
    for col, ddl in [
        ("tags",         "ALTER TABLE voices ADD COLUMN tags TEXT NOT NULL DEFAULT ''"),
        ("is_favorite",  "ALTER TABLE voices ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0"),
        ("display_name", "ALTER TABLE voices ADD COLUMN display_name TEXT"),
        ("icon_data",    "ALTER TABLE voices ADD COLUMN icon_data TEXT"),
        ("status",       "ALTER TABLE voices ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"),
        ("deleted_at",   "ALTER TABLE voices ADD COLUMN deleted_at TEXT"),
        ("device",       "ALTER TABLE jobs ADD COLUMN device TEXT"),
        ("user_agent",   "ALTER TABLE jobs ADD COLUMN user_agent TEXT"),
    ]:
        try:
            await db.execute(ddl)
            await db.commit()
        except Exception:
            pass  # column already exists

    await _run_once(db, "normalize_user_presets_lowercase", _normalize_user_presets_lowercase)
    await _run_once(db, "tag_noelmo_demo_seed_voice", _tag_noelmo_demo_seed_voice)
    await _run_once(db, "rename_noelmo_demo_tag", _rename_noelmo_demo_tag)
    await db.commit()


async def _run_once(db: aiosqlite.Connection, key: str, migration):
    async with db.execute("SELECT value FROM meta WHERE key = ?", (key,)) as cur:
        if await cur.fetchone():
            return
    await migration(db)
    await db.execute(
        """INSERT OR REPLACE INTO meta (key, value, updated_at)
           VALUES (?, '1', datetime('now'))""",
        (key,),
    )
    await db.commit()


async def _normalize_user_presets_lowercase(db: aiosqlite.Connection):
    async with db.execute(
        """SELECT name, temperature, exaggeration, cfg_weight, repetition_penalty,
                  top_p, min_p, created_at
           FROM user_presets
           ORDER BY datetime(created_at) DESC, rowid DESC"""
    ) as cur:
        rows = await cur.fetchall()

    if not rows:
        return

    latest_by_lower: dict[str, aiosqlite.Row] = {}
    for row in rows:
        key = row["name"].lower()
        if key not in latest_by_lower:
            latest_by_lower[key] = row

    await db.execute("DELETE FROM user_presets")
    for name, row in latest_by_lower.items():
        await db.execute(
            """INSERT INTO user_presets (
                   name, temperature, exaggeration, cfg_weight,
                   repetition_penalty, top_p, min_p, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                name,
                row["temperature"],
                row["exaggeration"],
                row["cfg_weight"],
                row["repetition_penalty"],
                row["top_p"],
                row["min_p"],
                row["created_at"],
            ),
        )


async def _tag_noelmo_demo_seed_voice(db: aiosqlite.Connection):
    tags = _serialize_tags(["Demo", "Male"])
    await db.execute(
        """UPDATE voices
           SET tags = ?
           WHERE name = 'noelmo-demo'
             AND (tags = '' OR tags IS NULL)""",
        (tags,),
    )


async def _rename_noelmo_demo_tag(db: aiosqlite.Connection):
    tags = _serialize_tags(["Demo", "Male"])
    await db.execute(
        """UPDATE voices
           SET tags = ?
           WHERE name = 'noelmo-demo'
             AND tags IN ('Noelmo Demo,Male', 'Noelmo Demo, Male')""",
        (tags,),
    )


async def _fail_stale_jobs(db: aiosqlite.Connection):
    await db.execute(
        """UPDATE jobs
           SET status='failed',
               error='Generation was interrupted because the Vox agent restarted.',
               completed_at=datetime('now')
           WHERE status IN ('queued', 'processing')"""
    )
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
            """INSERT INTO voices (id, name, filename, original_filename, description, tags)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                voice["name"],
                voice["filename"],
                voice["filename"],
                voice["description"],
                _serialize_tags(voice.get("tags", [])),
            ),
        )

    await db.commit()
