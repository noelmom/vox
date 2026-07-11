---
title: "Define the local and LAN trust model"
label: "wayfinder:grilling"
status: closed
assignee: codex
blocked_by: []
---

## Question

What trust boundaries and authentication behavior should Vox enforce for loopback, LAN access, browser-originated requests, destructive endpoints, voice data, backups, and logs so the product remains convenient locally without exposing private data or mutation capabilities to the network?

## Resolution

Vox has two explicit trust modes:

1. **Loopback mode (default).** Requests arriving through an allowed loopback host remain token-free for the installed Studio and local API clients. The server still validates `Host`, rejects cross-site mutation attempts using `Origin`/Fetch Metadata, applies upload and query limits, and never treats “localhost” as permission to accept arbitrary browser-originated writes.
2. **LAN mode (opt-in).** Unpaired devices may reach only a minimal liveness endpoint. The full Studio is available after a short-lived one-time pairing code shown by Vox Helper. Pairing issues a revocable, expiring credential; the browser receives an `HttpOnly`, `SameSite=Strict` session cookie and API clients may create explicit bearer tokens.

Credentials have scopes:

- `read` — status, presets, voice metadata, and job metadata.
- `generate` — `read` plus generation and audio retrieval.
- `admin` — backups, logs, settings/network changes, voice mutation, deletion, and token/session management.

Additional invariants:

- Pairing codes expire quickly, are rate-limited, are single-use, and are never logged.
- Session and API token secrets are stored outside the repository under Application Support with owner-only permissions; only derived token hashes are persisted.
- Backup contents, voice reference audio, generated scripts/audio, logs, filesystem paths, and detailed diagnostics are private data.
- Destructive UI actions require an in-product confirmation even with an `admin` session.
- Network-mode UI clearly states that LAN transport is HTTP unless the user places Vox behind trusted TLS; credentials must not be reused outside a trusted LAN.
- Switching LAN access off revokes remote sessions. A “Revoke all devices” control is available without deleting local data.
- Existing loopback automation remains compatible. LAN API clients receive an explicit authentication error rather than silent behavior changes.

This balances a zero-friction local product with an intentional, visible boundary when Vox is exposed beyond the Mac.
