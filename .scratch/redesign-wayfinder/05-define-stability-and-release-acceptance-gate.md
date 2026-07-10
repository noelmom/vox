---
title: "Define the full stability and release-acceptance gate"
label: "wayfinder:grilling"
status: closed
assignee: codex
blocked_by:
  - "Define the local and LAN trust model"
  - "Design a cancellation-safe generation lifecycle"
  - "Specify the Sparkle package-update architecture"
  - "Validate the redesigned application workflows"
---

## Question

What objective automated, manual, accessibility, performance, security, real-model, signed-installer, upgrade, recovery, notarization, and Apple Silicon acceptance criteria must all pass before the `redesign` branch can be presented for merge approval?

## Resolution

The required evidence is defined in [Vox redesign stability and release-acceptance gate](stability-gate.md). Every item is pass/fail; skipped evidence prevents presenting the branch as merge-ready unless Noel explicitly accepts the named exception.

The gate covers branch/publication protection, reproducible local CI, backend/API security, isolated generation and real MPS recovery, responsive UI behavior, accessibility, bundle budgets, native Sparkle integration, deterministic package inspection, signature/notarization checks, a full legacy/bridge/stable/beta/failure update matrix, user-data preservation, and the final review package.

Compatibility decision: retain `/api/v1`. Security enforcement differs by loopback versus opted-in LAN exposure, while new job states, stable error codes, pairing, and token fields are additive. Existing local API workflows remain valid.
