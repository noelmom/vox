from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


def _now_iso(timestamp: float | None = None) -> str:
    return datetime.fromtimestamp(timestamp or time.time(), UTC).isoformat()


def _secret_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PairingCode:
    value: str
    expires_at: str


@dataclass(frozen=True)
class IssuedCredential:
    id: str
    secret: str
    kind: str
    name: str
    scopes: frozenset[str]
    expires_at: str | None


@dataclass(frozen=True)
class Credential:
    id: str
    kind: str
    name: str
    scopes: frozenset[str]
    created_at: str
    expires_at: str | None
    last_used_at: str | None


class SecurityStore:
    """Small credential store; only hashes of high-entropy secrets reach disk."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._pairing_codes: dict[str, float] = {}
        self._attempts: dict[str, list[float]] = {}
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        with self._connect() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS credentials (
                    id TEXT PRIMARY KEY,
                    secret_hash TEXT UNIQUE NOT NULL,
                    kind TEXT NOT NULL,
                    name TEXT NOT NULL,
                    scopes TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    last_used_at TEXT,
                    revoked_at TEXT
                )
                """
            )
        os.chmod(self.path, 0o600)

    def create_pairing_code(self, ttl_seconds: int = 300) -> PairingCode:
        now = time.time()
        value = "-".join(
            "".join(secrets.choice("23456789") for _ in range(4)) for _ in range(2)
        )
        with self._lock:
            self._pairing_codes = {
                digest: expiry for digest, expiry in self._pairing_codes.items() if expiry > now
            }
            self._pairing_codes[_secret_hash(value)] = now + ttl_seconds
        return PairingCode(value=value, expires_at=_now_iso(now + ttl_seconds))

    def redeem_pairing_code(
        self,
        value: str,
        device_name: str,
        *,
        client_id: str = "unknown",
        session_ttl_seconds: int = 30 * 24 * 60 * 60,
    ) -> IssuedCredential | None:
        now = time.time()
        with self._lock:
            self._attempts = {
                source: recent
                for source, values in self._attempts.items()
                if (recent := [attempt for attempt in values if attempt > now - 300])
            }
            attempts = self._attempts.get(client_id, [])
            if len(attempts) >= 5:
                self._attempts[client_id] = attempts
                return None
            attempts.append(now)
            self._attempts[client_id] = attempts
            expiry = self._pairing_codes.pop(_secret_hash(value.strip()), None)
        if expiry is None or expiry <= now:
            return None
        return self._issue(
            "session",
            device_name,
            {"admin"},
            expires_at=now + session_ttl_seconds,
        )

    def create_api_token(
        self,
        name: str,
        scopes: set[str],
        *,
        ttl_seconds: int | None = None,
    ) -> IssuedCredential:
        allowed = {"read", "generate", "admin"}
        if not scopes or not scopes <= allowed:
            raise ValueError("Token scopes must contain read, generate, or admin.")
        expires_at = time.time() + ttl_seconds if ttl_seconds else None
        return self._issue("token", name, scopes, expires_at=expires_at)

    def _issue(
        self,
        kind: str,
        name: str,
        scopes: set[str],
        *,
        expires_at: float | None,
    ) -> IssuedCredential:
        credential_id = str(uuid.uuid4())
        secret = secrets.token_urlsafe(32)
        created_at = _now_iso()
        expiry_iso = _now_iso(expires_at) if expires_at else None
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO credentials (
                    id, secret_hash, kind, name, scopes, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    credential_id,
                    _secret_hash(secret),
                    kind,
                    name.strip()[:80] or "Unnamed device",
                    json.dumps(sorted(scopes)),
                    created_at,
                    expiry_iso,
                ),
            )
        return IssuedCredential(
            id=credential_id,
            secret=secret,
            kind=kind,
            name=name,
            scopes=frozenset(scopes),
            expires_at=expiry_iso,
        )

    def authenticate(self, secret: str) -> Credential | None:
        if not secret:
            return None
        now = _now_iso()
        with self._connect() as db:
            row = db.execute(
                """
                SELECT id, kind, name, scopes, created_at, expires_at, last_used_at
                FROM credentials
                WHERE secret_hash = ? AND revoked_at IS NULL
                  AND (expires_at IS NULL OR expires_at > ?)
                """,
                (_secret_hash(secret), now),
            ).fetchone()
            if row is None:
                return None
            db.execute(
                "UPDATE credentials SET last_used_at = ? WHERE id = ?",
                (now, row["id"]),
            )
        return Credential(
            id=row["id"],
            kind=row["kind"],
            name=row["name"],
            scopes=frozenset(json.loads(row["scopes"])),
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            last_used_at=now,
        )

    def list_credentials(self) -> list[Credential]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT id, kind, name, scopes, created_at, expires_at, last_used_at
                FROM credentials WHERE revoked_at IS NULL ORDER BY created_at DESC
                """
            ).fetchall()
        return [
            Credential(
                id=row["id"],
                kind=row["kind"],
                name=row["name"],
                scopes=frozenset(json.loads(row["scopes"])),
                created_at=row["created_at"],
                expires_at=row["expires_at"],
                last_used_at=row["last_used_at"],
            )
            for row in rows
        ]

    def revoke_credential(self, credential_id: str) -> bool:
        with self._connect() as db:
            cursor = db.execute(
                "UPDATE credentials SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
                (_now_iso(), credential_id),
            )
            return cursor.rowcount > 0

    def revoke_all_remote_credentials(self) -> int:
        with self._lock:
            self._pairing_codes.clear()
        with self._connect() as db:
            cursor = db.execute(
                "UPDATE credentials SET revoked_at = ? WHERE revoked_at IS NULL",
                (_now_iso(),),
            )
            return cursor.rowcount
