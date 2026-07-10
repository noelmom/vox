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
- Planning only: chart and resolve decisions before implementation. Implementation begins only after the map is clear and the resulting plan is approved.
- Consult `AGENTS.md`, `/grilling`, `/domain-modeling`, `/prototype`, `/research`, `/tdd`, and `/code-review` where their trigger applies.
- Preserve all runtime/user data and the existing shell updater as a recovery path.
- Sparkle direction already accepted: Vox Helper hosts Sparkle; releases remain signed/notarized bare package updates delivered through an HTTPS, EdDSA-signed appcast.
- Stability includes source checks, browser/responsive checks, real model generation/cancellation checks, signed package installation, update-from-prior-release, rollback/recovery, and Gatekeeper verification on Apple Silicon.

## Decisions so far

<!-- Resolution pointers are appended here as tickets close. -->

## Not yet specified

- Exact migration behavior for installations predating the first Sparkle-enabled bridge release.
- Detailed API compatibility policy and whether any security changes require versioned endpoints.
- Final component/module seams for decomposing the current large React route files.
- Exact release-channel and appcast retention policy after stable and prerelease behavior is decided.
- Failure recovery UX when package installation succeeds partially or the server cannot restart.
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
