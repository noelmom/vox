---
title: "Vox redesign and trusted update path"
label: "wayfinder:map"
status: open
branch: redesign
---

## Destination

Produce an approved, implementation-ready specification and dependency-ordered execution plan for a fully stable Vox release that combines backend safety hardening, the complete `/app` workspace redesign, and package-based Sparkle updates hosted by Vox Helper. The plan must include signed installer/update validation on Apple Silicon and must not merge or publish anything without Noel's explicit approval.

## Notes

- Product: a local-first Apple Silicon text-to-speech studio with a FastAPI service, React interface, native menu-bar helper, LaunchAgents, and signed/notarized package distribution.
- Working branch: `redesign`; `main` is protected by process and remains untouched until explicit approval.
- Execution is authorized on `redesign`: chart decisions, implement in dependency order, run local CI and release-candidate checks, commit focused checkpoints, and push only `redesign`.
- Where the user is unavailable, use the stated recommendation, record the assumption in the resolving ticket, and keep behavior reversible for morning review.
- Consult `AGENTS.md`, `/grilling`, `/domain-modeling`, `/prototype`, `/research`, `/tdd`, and `/code-review` where their trigger applies.
- Preserve all runtime/user data and the existing shell updater as a recovery path.
- Sparkle direction already accepted: Vox Helper hosts Sparkle; releases remain signed/notarized bare package updates delivered through an HTTPS, EdDSA-signed appcast.
- Stability includes source checks, browser/responsive checks, real model generation/cancellation checks, signed package installation, update-from-prior-release, rollback/recovery, and Gatekeeper verification on Apple Silicon.

## Decisions so far

<!-- Resolution pointers are appended here as tickets close. -->

- [Define the local and LAN trust model](01-define-local-and-lan-trust-model.md) — keep loopback frictionless but cross-origin protected; require short-lived pairing and revocable scoped credentials for the full LAN Studio and API.
- [Design a cancellation-safe generation lifecycle](02-design-cancellation-safe-generation-lifecycle.md) — isolate Chatterbox in one supervised subprocess; cancellation and timeout kill and reap that owner before terminal state or replacement, while the coordinator owns durable queueing and atomic output publication.
- [Specify the Sparkle package-update architecture](03-specify-sparkle-package-update-architecture.md) — Vox Helper hosts pinned Sparkle 2; immutable notarized flat packages ship through a stable/default plus opt-in beta appcast after a one-time manual bridge, with the shell updater retained only for recovery/source installs.

## Not yet specified

- Detailed API compatibility policy and whether any security changes require versioned endpoints.
- Final component/module seams for decomposing the current large React route files.
- Performance budgets beyond the initial bundle/image observations.

## Out of scope

- Merging `redesign` into `main`, tagging, or publishing a release before explicit approval.
- Cloud accounts, cloud synthesis, telemetry, subscriptions, or cross-device sync.
- Intel Mac support or lowering the supported macOS baseline.
- Dark mode and unrelated post-v1 feature expansion.

## Open child tickets

- [Define the local and LAN trust model](01-define-local-and-lan-trust-model.md)
- [Design a cancellation-safe generation lifecycle](02-design-cancellation-safe-generation-lifecycle.md)
- [Specify the Sparkle package-update architecture](03-specify-sparkle-package-update-architecture.md)
- [Validate the redesigned application workflows](04-validate-redesigned-application-workflows.md)
- [Define the full stability and release-acceptance gate](05-define-stability-and-release-acceptance-gate.md)
- [Slice the approved design into tracer-bullet implementation tickets](06-slice-implementation-tickets.md)
