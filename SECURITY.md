# Security Policy

## Supported Versions

Security fixes target the latest public release and the active `development` branch.

## Reporting A Vulnerability

Please do not open a public issue for sensitive security reports.

Report security concerns privately to the maintainer through the support contact at:

https://noelmom.github.io

Include:

- Vox version
- macOS version and Mac model
- Reproduction steps
- Relevant logs or request IDs
- Whether local-only mode or network-accessible mode was enabled

## Local Data Model

Vox is designed to run locally. Scripts, voice profiles, generated audio, logs, and the SQLite database are stored on the user's Mac under `~/Library/Application Support/Vox` and `~/Library/Logs/Vox`.
