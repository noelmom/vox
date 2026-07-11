# Vox redesign stability and release-acceptance gate

Every required item is **pass/fail**. “Looks good,” a narrow test run, or absence of a reported problem is not evidence. Any skipped item makes the candidate ineligible for merge approval unless Noel explicitly accepts the named exception.

## 0. Branch and publication guard

- Candidate commit is on `redesign`, pushed to `origin/redesign`, and the worktree is clean.
- `main` has not moved because of this effort.
- No release tag, GitHub Release, live appcast, or public package was created.
- Release tooling defaults to dry-run/build-only and requires an explicit publish flag plus confirmation.
- Generated evidence identifies commit, version, numeric build, toolchain versions, macOS version, architecture, and Sparkle version.

## 1. Reproducible local CI

One documented command, `scripts/ci-local.sh`, runs the same checks as hosted CI without using hosted minutes. It supports clean dependency installation and writes a timestamped machine-readable summary under ignored build output.

Required checks:

```text
Backend lint                ruff check api tests
Backend tests               pytest, including async/process/security suites
Spelling                    codespell with documented exclusions
Frontend install            npm ci from committed package-lock.json
Frontend typecheck          tsc --noEmit
Frontend lint               ESLint with no warnings
Frontend unit/component     Vitest + Testing Library
Frontend accessibility      axe assertions for primary states
Frontend production build   Vite build + bundle-budget verifier
Frontend end-to-end         Playwright against a deterministic fake API
Shell syntax                bash -n
Shell static analysis       ShellCheck on maintained scripts
Swift dependency resolve    pinned Package.resolved
Swift build/test            release helper + server launcher checks
Generated UI                ui-dist matches a clean source build
```

The complete local CI command passes twice consecutively: once from the working dependency cache and once after deleting project-local dependency/build caches. CI configuration runs on pushes to `redesign` during development and remains suitable for pull requests targeting `main`.

## 2. Backend security and API contract

Automated tests prove:

- Voice names reject empty values, traversal, separators, Unicode confusables outside the slug policy, reserved names, and excessive length; resolved paths stay under `voice_dir`.
- Voice, inline prompt, icon, and backup uploads stream with byte limits and clean partial files on rejection.
- Backup restore rejects traversal, symlinks/special entries, entry-count overflow, compression bombs, expanded-size overflow, incompatible manifests, and invalid database schemas before replacing data.
- Restore and settings updates are atomic or recoverable; failure preserves the prior database, voices, and `.env`.
- Pagination and query inputs have explicit upper/lower bounds.
- Loopback host/origin behavior matches the trust model, including rejection of cross-site mutations.
- LAN mode exposes only minimal liveness before pairing; pairing expiry, single use, rate limits, cookie attributes, bearer scopes, revocation, and secret-file permissions are tested.
- Read/generate/admin scope boundaries cover every route, including logs, backups, voice reference audio, deletion, network settings, and token management.
- API errors use stable machine codes plus safe messages and request IDs; secrets, raw paths, tokens, and unsafe exception strings do not leak.
- Existing `/api/v1` loopback clients remain compatible. New job states and auth fields are additive; no `/api/v2` is needed for this release.

## 3. Generation lifecycle and real model

Fake-worker tests prove every invariant in `generation-lifecycle-prototype.md`, including worker PID exclusivity, compare-and-set terminal states, restart reconciliation, atomic output publication, and cleanup.

Apple Silicon MPS evidence must additionally show:

- Ten sequential representative generations complete without overlap or progressive failure.
- Cancellation is exercised while queued, during inference, and during encoding.
- Active cancellation reports `cancelling` until the worker exits; the replacement model reaches `ready` before another job processes.
- A forced worker crash and a forced timeout both recover without an overlapping MPS owner.
- A long multi-chunk job completes after recovery.
- Temporary/partial files are absent after each failure path.
- User-visible job state matches database state after server restart.
- Memory behavior is recorded before/after the sequence; no MPS memory-fraction cap is introduced.

## 4. Frontend behavior, accessibility, and performance

Automated browser tests cover Create, Voices, History, Settings, pairing, and compatibility redirects at representative viewports: 1440×900, 1024×768, 768×1024, and 390×844.

Required scenarios:

- Empty, populated, loading, offline, model-loading/recovering, unauthorized/expired session, API failure, and long-content states.
- Generation submitting, queued, processing, cancelling, encoding, completed, failed, and interrupted without fake percentage progress.
- Playback across route navigation, source replacement, seek/speed/volume, expired audio, delete race, and paused reload restoration.
- Voice upload/record permission denial, retry, progress, limits, replacement, and deletion confirmation.
- Settings immediate/staged/restart-required behavior, pairing/device revocation, Sparkle channel/check controls, backup/restore, and cleanup confirmation.
- Old Library, Recordings, and Logs URLs land at their canonical destinations.

Accessibility evidence:

- Automated axe scan has no serious or critical violations in each primary route/state.
- Keyboard-only smoke path completes every primary workflow with visible focus and correct focus restoration.
- VoiceOver smoke test covers navigation, generation status, dialogs/sheets, history playback, waveform seek alternative, and pairing.
- 200% browser zoom, reduced motion, long localized-like strings, and color-independent status remain usable.
- Text and interactive contrast meet WCAG 2.2 AA; touch targets are at least 44×44 px on mobile.

Performance evidence:

- Initial application JavaScript ≤125 kB gzip.
- No lazy route exceeds 150 kB gzip without an explicitly approved exception.
- CSS ≤30 kB gzip.
- Normal UI raster assets are ≤100 kB each and dimensioned for display.
- No meaningful cumulative layout shift from banners/player; visible response to local interaction begins within 100 ms.
- Only the active/visible audio waveform performs continuous work.

## 5. Native helper and Sparkle

- SwiftPM resolves the committed exact Sparkle version without changing `Package.resolved`.
- Release helper builds for arm64/macOS 13 and `otool` proves the expected `@rpath`/embedded framework linkage.
- Final bundle preserves Sparkle framework symlinks and required helper/XPC contents.
- Nested Sparkle code is signed inside-out; the build does not depend on `codesign --deep` to create signatures.
- Helper plist has correct `SUFeedURL`, `SUPublicEDKey`, automatic-check policy, semantic display version, unique increasing numeric build, and macOS 13 minimum.
- Normal “Check for Updates…” uses Sparkle without opening Terminal; recovery/source update remains clearly separate.
- Stable clients cannot see beta items; opted-in beta clients can see beta and later stable items.
- Appcast verifier checks XML, channel, unique/increasing build, immutable HTTPS URL, exact byte length, EdDSA signature, release notes, and supported minimum OS/hardware.

## 6. Installer and update package

Before signing, deterministic package inspection proves:

- Payload contains the two expected app bundles, Sparkle framework, bootstrap/runtime files, and no secrets, caches, developer paths, extended-attribute debris, or unintended artifacts.
- Fresh-install and update paths are selected from reliable receipt/installed-state evidence.
- Update mode performs no Homebrew/model/dependency network bootstrap unless a declared dependency migration requires it.
- Update mode never opens Welcome, preserves user data, and records transaction start/completion.
- Package scripts are idempotent and failure fixtures leave actionable logs and repair instructions.
- App/server minimum system versions agree on macOS 13 and package/platform checks enforce Apple Silicon.

Signed candidate checks:

```text
codesign --verify --strict --verbose=2 <each app/framework/nested executable>
pkgutil --check-signature Vox-<version>.pkg
spctl --assess --type install --verbose Vox-<version>.pkg
xcrun stapler validate Vox-<version>.pkg
pkgutil --payload-files Vox-<version>.pkg
```

Notarization log is archived and reviewed even when status is Accepted.

## 7. Apple Silicon install/update matrix

Run with the exact notarized candidate, preferably on a separate clean test account or machine:

1. Fresh install on supported macOS with no prior Vox data.
2. Fresh install cancellation before authorization.
3. Last legacy release → Sparkle bridge package.
4. Bridge → candidate stable through Sparkle.
5. Stable → beta opt-in; beta → later higher-build stable.
6. Update authorization cancellation.
7. Unreachable feed/package and deliberately invalid EdDSA fixture.
8. Package-script failure fixture followed by documented repair.
9. Successful package receipt with forced server-health failure and manual recovery.
10. Reinstall the same candidate and install a newer candidate to prove idempotency/version ordering.

For every data-preservation case, snapshot and compare `.env`, database contents, voice assets, outputs/recordings, input, preferences, paired-device/token state as appropriate, and LaunchAgent settings. New schema migrations may change structured data only as documented; user content cannot disappear.

Each successful install/update verifies:

- helper relaunch and menu action;
- server/model state progression;
- Studio availability;
- one generation and playback/download;
- login-item state;
- build identity agreement across helper, server API, receipt, and installed-version record;
- logs contain no secret and identify the transaction/request.

## 8. Review and approval package

Before asking Noel for merge approval, provide:

- commit range and categorized change summary;
- unresolved known issues and accepted exceptions (ideally none at P0/P1);
- local CI summaries and exact commands;
- backend/security and generation test reports;
- browser screenshots for every route at desktop and mobile;
- accessibility report;
- bundle report;
- signed package checksum, signature/Gatekeeper/stapler output, notarization ID/log;
- install/update matrix with data-preservation evidence;
- manual test checklist focused on product feel;
- rollback/recovery instructions.

Merge remains a separate explicit user action after review. Passing this gate authorizes presenting the branch, not merging it.
