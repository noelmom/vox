# Tickets: Vox trusted redesign

Build the backend hardening, creative-workspace UI, Sparkle package updates, and release evidence specified by the [Wayfinder map](.scratch/redesign-wayfinder/map.md). Work the **frontier**: a ticket may start only when every named blocker is complete. Each ticket must leave the branch green, produce its own evidence, and be committed/pushed to `redesign`.

## Establish the local quality loop

**What to build:** Give contributors one reliable local command that installs pinned dependencies, runs backend/frontend/Swift/shell checks, verifies generated UI output, and reports exactly what passed without consuming hosted CI minutes.

**Blocked by:** None — can start immediately.

- [x] Commit the npm lockfile and switch automation to reproducible installs.
- [x] Add frontend lint, unit/component, accessibility, and deterministic browser-test foundations.
- [x] Add a local CI runner with normal and clean-cache modes plus machine-readable summaries.
- [x] Run CI on `redesign` pushes and pull requests without weakening existing `main` checks.
- [x] Preserve a clean generated UI tree and document the command in contributor/agent guidance.

**Rollback point:** Tooling-only commit; reverting it restores the former commands without changing runtime behavior.

**Verify:** Run the local CI command once normally and once with clean caches; both reports must pass.

## Protect loopback and pair LAN devices

**What to build:** Keep installed local Studio/API use frictionless while making LAN exposure intentional: unpaired remote devices see only liveness and a pairing screen, paired browsers/API clients receive revocable scoped access, and cross-site browser mutations are rejected.

**Blocked by:** Establish the local quality loop.

- [x] Enforce trusted host, Origin/Fetch Metadata, and loopback/LAN request classification.
- [x] Generate short-lived, single-use, rate-limited pairing codes without logging secrets.
- [x] Issue secure browser sessions and hashed scoped API tokens with read/generate/admin enforcement across every route.
- [x] Store secrets with owner-only permissions, support device/token listing and revocation, and revoke remote sessions when LAN mode is disabled.
- [x] Present pairing and network-security UX without leaking private status before authentication.
- [x] Prove existing loopback `/api/v1` clients remain compatible.

**Rollback point:** Feature flag/default loopback mode keeps the new remote surface disabled; one focused commit can revert middleware, schema, and pairing UI together.

**Verify:** Run security/API tests and browser pairing tests covering loopback, cross-site rejection, expiry, scope boundaries, and revocation.

## Make ingest, backup, and destructive operations safe

**What to build:** Voice uploads, inline prompts, icons, backups, restores, cleanup, and deletion reject malicious or oversized input, never escape managed directories, and leave prior user data intact on every failure path.

**Blocked by:** Establish the local quality loop.

- [ ] Replace permissive voice-name handling with a documented canonical slug and containment checks.
- [ ] Stream uploads with explicit byte, duration, format, and entry limits and deterministic cleanup.
- [ ] Validate backup manifests, archive entries, expanded size, compression ratio, and database schema before mutation.
- [ ] Restore database/voices atomically with rollback and preserve `.env`, outputs, input, and unrelated preferences.
- [ ] Bound list/query inputs and return stable safe errors with request IDs.
- [ ] Surface actionable validation and recovery messages in existing/new UI flows.

**Rollback point:** Keep the old data untouched until atomic replacement; code can revert without a data migration.

**Verify:** Run malicious-input, failure-injection, data-snapshot, and UI error-state tests.

## Isolate generation and publish truthful job states

**What to build:** Run Chatterbox in one supervised subprocess so cancellation, timeout, crash, shutdown, and retry cannot overlap MPS ownership; expose durable queued/processing/cancelling/encoding/interrupted states and atomically publish audio.

**Blocked by:** Establish the local quality loop.

- [ ] Introduce the coordinator/worker IPC boundary from the generation lifecycle prototype.
- [ ] Make the coordinator own FIFO queueing, compare-and-set job transitions, cancellation, retries, encoding, cleanup, and atomic output publication.
- [ ] Kill and reap the active worker before terminal cancellation/timeout or replacement startup.
- [ ] Reconcile non-terminal jobs and partial directories after restart.
- [ ] Extend `/api/v1` and SSE/polling with additive stable state/error fields.
- [ ] Update generation UI state handling so “Stopping…” and model recovery reflect backend truth.

**Rollback point:** Preserve the public submission/status contract so the previous in-process runner can be restored in one commit before schema rollout; migrations are additive.

**Verify:** Run fake-worker state-machine tests, forced crash/timeout tests, restart cleanup tests, and the real Apple Silicon MPS recovery sequence.

## Install the creative-workspace shell and global player

**What to build:** Replace the dashboard-like frame with four quiet destinations, truthful global status, compatibility redirects, responsive navigation, and one accessible audio player that survives route changes.

**Blocked by:** Establish the local quality loop.

- [ ] Introduce canonical Create, Voices, History, and sectioned Settings routes plus redirects from old URLs.
- [ ] Remove sidebar analytics, marketing footer, and healthy-state hardware pills from the main workspace.
- [ ] Add wide/collapsed/mobile navigation, skip link, landmarks, error boundary, pairing gate slot, and actionable global banners.
- [ ] Add one global audio controller, dock, mobile mini-player, waveform seek alternative, URL cleanup, and paused reload restoration.
- [ ] Route-split the application and keep shell/media contracts independently testable.

**Rollback point:** Compatibility routes and the old page modules remain callable until each page ticket migrates; contract before deleting old shell code.

**Verify:** Run shell/player unit tests and browser tests at all four target viewports across navigation, playback, offline, and expired/deleted audio.

## Deliver the Create audio workspace

**What to build:** Make script, voice, and generation the primary loop: dominant editor, responsive inspector/sheet, truthful generation stepper, compact previous recordings, and persistent-result playback matching the approved prototype.

**Blocked by:** Isolate generation and publish truthful job states; Install the creative-workspace shell and global player.

- [ ] Preserve draft/history/import/character-limit behavior while splitting the monolithic route into tested feature components.
- [ ] Implement wide inspector and mobile summary-triggered sheet without hiding the script or primary action.
- [ ] Render every backend job/model state without simulated progress and make cancellation idempotent.
- [ ] Show at most three dense recent jobs with play, download, regenerate, and overflow behavior.
- [ ] Handle empty, long-content, loading, offline, expired-session, interrupted, and failure states accessibly.
- [ ] Match the full-page Create hierarchy at desktop and mobile.

**Rollback point:** Keep API/preferences compatible and land the new route behind a temporary local feature switch until browser coverage passes; remove the switch before final integration.

**Verify:** Run Create unit/component/browser tests, visual screenshots at target viewports, axe, keyboard, and reduced-motion checks.

## Deliver the Voices workspace

**What to build:** Provide a stable searchable voice collection, wide inspector/mobile sheet, safe upload and recording dialog, reference playback, favorites/tags/defaults, and explicit “Use voice” flow without expanding cards in place.

**Blocked by:** Protect loopback and pair LAN devices; Make ingest, backup, and destructive operations safe; Install the creative-workspace shell and global player.

- [ ] Decompose voice collection, inspector, capture dialog, and media controls into tested feature modules.
- [ ] Implement search/filter/grid-list preference and stable selected-card behavior.
- [ ] Combine upload and recording modes with real progress and distinct permission/device/format/limit failures.
- [ ] Support edit, replace audio, favorite, defaults, icon, tags, confirmed delete, and Use voice navigation.
- [ ] Ensure only active previews consume audio/canvas work and all controls are keyboard/screen-reader complete.

**Rollback point:** Retain existing voice endpoints and preference keys; the previous route can be restored without data migration.

**Verify:** Run voice API/security tests, capture mocks, component/browser tests, viewport screenshots, axe, and keyboard checks.

## Deliver the History workspace

**What to build:** Make generated work easy to scan and reuse through one filter toolbar, date-grouped compact rows, active-row waveform detail, truthful statuses, persistent playback, and regeneration for expired audio.

**Blocked by:** Isolate generation and publish truthful job states; Install the creative-workspace shell and global player.

- [ ] Decompose filter/query state, grouping, list rows, active media, and actions into tested modules.
- [ ] Bound pagination while preserving search, voice/status/date filters, and newest-first ordering.
- [ ] Render every durable job state, safe diagnostic detail, request ID, and expired-file behavior.
- [ ] Integrate play/download/regenerate/confirmed-delete with the global player and Create handoff.
- [ ] Avoid per-row background canvas/audio work and retain accessible exact timestamps.

**Rollback point:** Preserve the jobs API and old route redirect; no history data migration is destructive.

**Verify:** Run API pagination/state tests, component/browser tests with large histories, viewport screenshots, axe, and playback/delete race checks.

## Deliver Settings, diagnostics, pairing, and update controls

**What to build:** Replace the long settings page with General, Audio, Storage, Network, Diagnostics, Updates, and About sections that clearly distinguish immediate, staged, restart-required, destructive, pairing, and native-update actions.

**Blocked by:** Protect loopback and pair LAN devices; Install the creative-workspace shell and global player; Embed Sparkle in Vox Helper.

- [ ] Implement section navigation and conventional preference rows with truthful save/restart feedback.
- [ ] Integrate defaults, storage retention, atomic backup/restore, cleanup confirmation, and safe path display.
- [ ] Provide LAN pairing/device/token management and transport warning from the trust model.
- [ ] Consolidate logs, runtime/model/build identity, request lookup, paths, and repair actions under Diagnostics.
- [ ] Provide stable/beta preference, automatic-check setting, current/available version, native Check for Updates, and clearly separate recovery updater.
- [ ] Move support, licensing, acknowledgements, and build metadata to About.

**Rollback point:** Existing server preference keys remain readable; each settings section can be reverted independently before the old page is removed.

**Verify:** Run settings/API/component/browser tests across immediate/staged/restart, destructive, pairing, update-channel, offline, and error states.

## Embed Sparkle in Vox Helper

**What to build:** Build Vox Helper reproducibly with pinned Sparkle 2, present native update UI, expose stable/beta preference, preserve recovery update access, and produce a correctly linked/signable app bundle.

**Blocked by:** Establish the local quality loop.

- [ ] Add the pinned SwiftPM dependency and committed resolution.
- [ ] Make the helper own a long-lived standard updater controller and bind menu enablement/check action correctly.
- [ ] Add feed/public-key/version/automatic-check plist contract and channel delegate behavior.
- [ ] Copy the framework with symlinks, link through the expected rpath, and sign nested code inside-out.
- [ ] Align every native minimum-system declaration to arm64 macOS 13.
- [ ] Retain an explicit repair/source-update action without opening Terminal for normal updates.

**Rollback point:** The existing Terminal updater remains functional until the Sparkle bundle passes notarized bridge testing; dependency integration is one focused native commit.

**Verify:** Resolve/build twice from the pinned dependency, inspect linkage/rpaths/framework tree/plist, run Swift tests, and perform unsigned local menu/update-fixture checks.

## Make package installation and update transactional

**What to build:** Make one package safely handle fresh install, bridge, and subsequent update while preserving user data, avoiding first-install work during updates, recording transactions, restarting deliberately, and offering repair after injected failures.

**Blocked by:** Make ingest, backup, and destructive operations safe; Isolate generation and publish truthful job states; Embed Sparkle in Vox Helper.

- [ ] Detect fresh install/update from reliable installed state and package receipt.
- [ ] Split prerequisite/bootstrap/Welcome behavior from fast idempotent update behavior.
- [ ] Stop/reload helper, server, model worker, and LaunchAgents in an order compatible with Sparkle relaunch.
- [ ] Preserve and verify all user/runtime data; record transaction start, target, completion, and failure diagnostics.
- [ ] Add package inspection and failure fixtures plus repair/last-known-good guidance.
- [ ] Keep source/recovery updater safe from unexpected branches and signed-app replacement.

**Rollback point:** Keep a last-known-good full package and idempotent repair path; package mutations never delete user data and incomplete transactions remain detectable.

**Verify:** Run package-script unit/fixture tests, payload inspection, repeated install simulation, and data snapshot comparisons before signing.

## Build and verify appcasts without publishing

**What to build:** Turn release automation into prepare/build/verify/publish stages that can produce signed candidate metadata, stable/beta appcasts, release notes, provenance, and dry-run evidence without tagging, pushing a release, or changing the live feed.

**Blocked by:** Embed Sparkle in Vox Helper; Make package installation and update transactional.

- [ ] Require clean branch, valid display version, unique monotonic build, pinned Sparkle, channel, and release notes.
- [ ] Build UI/apps/package from one commit and verify signatures, plist, payload, symlinks, linkage, checksums, and notarization output.
- [ ] Sign final packages with Sparkle EdDSA and deterministically render/validate stable and beta items.
- [ ] Stage immutable package/release-note URLs and enforce appcast-last ordering.
- [ ] Make publish an explicit guarded action; normal CI and this effort remain dry-run only.
- [ ] Archive provenance, signatures, notarization data, checksums, appcast, notes, and dSYMs.

**Rollback point:** Candidate generation writes only staging/evidence output; live feed/tag/release remain unchanged unless the separately approved publish gate is invoked.

**Verify:** Run deterministic appcast fixtures for stable/beta/version regression/bad signature/missing artifact and a complete release dry run with no external publication.

## Integrate, audit, and meet product budgets

**What to build:** Make the complete redesign behave as one product, close cross-feature races and regressions, meet accessibility/performance budgets, update documentation, and produce clean local-CI evidence.

**Blocked by:** Deliver the Create audio workspace; Deliver the Voices workspace; Deliver the History workspace; Deliver Settings, diagnostics, pairing, and update controls; Build and verify appcasts without publishing.

- [ ] Run the full backend/frontend/native/package fixture suite and fix every regression.
- [ ] Complete route/state/viewport visual verification and store desktop/mobile evidence.
- [ ] Complete axe, keyboard, reduced-motion, zoom, long-content, and VoiceOver smoke checks.
- [ ] Meet JavaScript/CSS/image/work budgets or obtain an explicit documented exception.
- [ ] Run code review against repository standards and every source specification; resolve all P0/P1 and unaccepted P2 findings.
- [ ] Update README, AGENTS, scripts documentation, changelog/backlog status, architecture, security, pairing, recovery, and testing instructions.
- [ ] Pass local CI twice, including the clean-cache run, with a clean/pushed branch.

**Rollback point:** Integration commit contains only cross-cutting fixes/docs/evidence; each feature remains independently revertible through its focused commit chain.

**Verify:** Execute every non-signing item in the stability gate and generate the review bundle.

## Validate the signed bridge and update matrix on Apple Silicon

**What to build:** Produce—but do not publish—the exact signed/notarized candidate and prove fresh install, legacy bridge, Sparkle stable/beta updates, failure recovery, MPS generation, and user-data preservation on Apple Silicon.

**Blocked by:** Integrate, audit, and meet product budgets.

- [ ] Build/sign/notarize/staple the bridge and candidate packages without tagging or publishing.
- [ ] Pass signature, Gatekeeper, stapler, payload, linkage, and notarization-log review.
- [ ] Execute every fresh-install, bridge, stable/beta, cancellation, bad-feed/signature, package-failure, health-failure, reinstall, and later-build case in the stability gate.
- [ ] Snapshot and compare all protected user data and LaunchAgent/login preferences.
- [ ] Complete the real MPS generation/cancellation/crash/timeout/reload sequence.
- [ ] Assemble checksums, logs, screenshots, CI reports, test matrix, manual product checklist, and rollback instructions for Noel.
- [ ] Push final focused commits to `redesign` and request approval without merging or publishing.

**Rollback point:** Retain last-known-good package and evidence; no live appcast/release exists, so failure cannot affect users.

**Verify:** The complete stability gate is checked with authoritative artifacts and no missing/waived item unless Noel explicitly approves it.
