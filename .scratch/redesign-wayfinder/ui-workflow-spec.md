# Vox Studio application workflow specification

## Prototype verdict

The approved direction is a **persistent creative workspace**, not a dashboard: quiet navigation, one dominant task per route, a right-hand inspector where appropriate, and one global playback dock. The selected full-page visual prototypes are preserved as implementation references:

- [Create while generating](ui-prototype/create-generating.png)
- [Voices](ui-prototype/voices.png)
- [History](ui-prototype/history.png)
- [Settings](ui-prototype/settings.png)

The images define hierarchy and density, not pixel-perfect implementation. Production code must use real data, semantic controls, responsive behavior, and the state contracts below.

## Information architecture

Primary navigation has four destinations:

1. **Create** — compose a script, choose delivery, submit generation, and reuse recent clips.
2. **Voices** — search, preview, add, record, edit, favorite, and select voice profiles.
3. **History** — find, play, download, regenerate, and delete generation jobs.
4. **Settings** — configure general, audio, storage, network, diagnostics, update, and about behavior.

Canonical routes:

```text
/app                Create
/app/voices         Voices
/app/history        History
/app/settings       Settings
/app/settings/:tab  Settings subsection
```

Compatibility redirects preserve bookmarks:

```text
/app/library    → /app/voices
/app/recordings → /app/history
/logs           → /app/settings/diagnostics
```

The welcome/install surface remains `/`. API documentation remains `/docs`.

## Application shell

The shell owns only cross-route concerns:

- authentication/pairing gate;
- server/model/update warning banners;
- primary navigation;
- global query/error boundary;
- one `HTMLAudioElement` and playback state;
- persistent playback dock or mobile mini-player;
- responsive navigation state.

It does not fetch page-specific lists or render usage analytics. Hardware, build, paths, logs, support, and release details move to Settings. Healthy state is one quiet **Ready** indicator; degraded state becomes a banner with an action.

Remove the permanent marketing footer and sidebar analytics cards from `/app`.

## Responsive layout

### Wide — 1280 px and above

- 216 px primary sidebar.
- Route content fills the remaining width.
- Create and Voices may use a 320–360 px right inspector.
- Playback dock spans the workspace bottom and remains visible without covering route content.

### Compact desktop/tablet — 768–1279 px

- Sidebar collapses to 68 px at the lower end.
- Main content remains primary.
- Inspectors open as modal sheets/drawers and preserve unsaved state when closed.
- Playback dock becomes a shorter two-row layout if needed.

### Mobile — below 768 px

- Top bar contains brand and current route; bottom navigation contains the four destinations.
- Create opens on the script, not a full voice panel.
- A sticky summary such as `Noel Demo · Calm · MP3` opens the voice/output inspector as a bottom sheet.
- Primary generation action remains reachable above the mobile mini-player.
- Mini-player expands to a full-screen player; it never hides the primary action or bottom navigation.
- Tables become semantic lists; secondary metadata collapses before primary actions.

## Create workflow

### Idle

- Script editor is the dominant surface and restores a local draft.
- Title is editable but optional; a deterministic title is derived from the first sentence when absent.
- Import, script history, and overflow actions sit in the editor header.
- Character count, configured limit, and approximate duration are informational and never presented as exact.
- Voice, style, format, and fine-tuning live in the inspector.
- `Generate audio` is enabled only when script text is valid, the server/model is ready, and required voice assets exist.

### Submission and generation

Display backend truth, never simulated percentage:

```text
submitting  → “Submitting…”
queued      → “Queued” with queue position when available
processing  → “Generating” with elapsed time and current chunk when available
cancelling  → “Stopping…”
encoding    → “Encoding audio”
completed   → load result into the playback dock
failed      → stable error message, request ID, Retry, Diagnostics
interrupted → explain restart/interruption and offer Retry
```

The visible stepper is `Preparing → Generating → Encoding`. It advances only from server state. Cancel remains available during queued/processing/encoding states. It becomes disabled after one request and does not claim cancellation until the server returns a terminal state.

The editor stays readable during generation. Voice/output controls that cannot affect the active job are disabled with a short explanation; changes may be staged for the next job.

### Previous recordings

Create shows at most three recent jobs in a dense list below generation state:

- play/pause;
- title and one-line script excerpt;
- voice;
- duration;
- status;
- download when available;
- regenerate;
- overflow actions.

`View all history` navigates to History without interrupting playback.

## Persistent playback

There is one global playback controller and one audio element. Route cards dispatch `play(job)` rather than creating independent competing players.

The dock contains title, voice, play/pause, seekable waveform, elapsed/total time, ±10 seconds, speed, volume, download, regenerate, and overflow. It persists across route navigation.

Rules:

- Starting another clip replaces the current source and preserves the user's volume/speed preferences.
- Reload may restore the last playable job metadata but starts paused; autoplay is never attempted.
- An expired/deleted file keeps metadata visible and offers Regenerate rather than a broken player.
- Deleting the active job stops playback before deletion and clears the dock after success.
- Object URLs are revoked when replaced/unmounted.
- Waveform seeking has an equivalent native range control and current-time text for assistive technology.

## Voices workflow

- Toolbar: search, favorite/tag filters, grid/list preference, `Add voice`.
- Voice collection is compact and stable; cards do not expand in place.
- Selecting a voice opens the right inspector on wide screens and a sheet elsewhere.
- The inspector owns display name, tags, favorite state, defaults, reference preview, replace audio, and delete.
- `Use voice` updates Create's selection and navigates to Create only when explicitly activated.
- `Add voice` is one dialog with Upload and Record modes. Input-folder ingest remains documented but is not a third fake upload source.
- Recording preflight distinguishes unsupported browser, denied permission, no device, and capture failure.
- Upload and recording both validate size, duration, and format before mutation; progress is real bytes/time, not decorative.

## History workflow

- One toolbar provides text search, voice, terminal status, date range, and sort.
- Results are grouped by local calendar date but retain exact timestamps in accessible labels/tooltips.
- Rows stay dense. Only the active row renders the detailed waveform; other rows use play controls and metadata.
- Status is explicit: queued, processing, cancelling, encoding, completed, failed, interrupted, expired.
- Expired audio remains regenerable from retained script metadata.
- Bulk deletion is out of scope for this redesign; clear-output behavior remains an explicitly confirmed Settings action.

## Settings workflow

Secondary navigation:

```text
General · Audio · Storage · Network · Diagnostics · Updates · About
```

- General: draft/player/sidebar preferences.
- Audio: default voice, style, format, quality, and fine-tuning defaults.
- Storage: paths, retention, backup/restore, and confirmed cleanup actions.
- Network: loopback/LAN mode, pairing, paired devices, API tokens, revoke controls, and transport warning.
- Diagnostics: runtime/model state, logs, request lookup, paths, build identity, and repair actions.
- Updates: stable/beta choice, automatic-check preference, current/available version, native Check for Updates, and recovery updater disclosure.
- About: version, licenses, support, and acknowledgements.

Settings rows use conventional aligned labels/controls and thin separators. Save behavior is explicit: preferences that take effect immediately say so; server values requiring restart are staged and show a restart action. No screen says “saved locally” for values actually persisted by the server without explaining that distinction.

## Pairing and degraded states

- A remote unpaired browser sees only the pairing screen, not the application shell or private metadata.
- Pairing accepts a short-lived code, explains the device/session name, and reports expiry/rate limiting without revealing secrets.
- Server unavailable: preserve draft and playback metadata, disable mutations, show `Server unavailable`—never `Ready`.
- Model loading/recovering: navigation and existing playback remain usable; generation shows the actual model state.
- Authentication expiry: pause private refetches, retain unsaved local input, and return to pairing with a reason.
- Global banners are reserved for actionable cross-route conditions. Page-level failures stay with the page.

## Accessibility contract

- One visible-on-focus skip link and correct `nav`, `main`, `aside`, and `footer`/dock landmarks.
- Every icon-only control has a stable accessible name and at least a 44×44 px mobile target.
- Navigation exposes `aria-current="page"`; toggle groups expose pressed/selected state.
- Dialogs/sheets trap focus, close on Escape when safe, restore focus to the opener, and warn before discarding input.
- Generation and update states use a polite live region; destructive/auth failures use assertive announcements sparingly.
- Waveform/canvas visuals never carry state alone; text and native controls provide equivalents.
- Status never relies on color alone. Contrast meets WCAG 2.2 AA.
- All workflows are keyboard complete. Global shortcuts never fire while typing.
- `prefers-reduced-motion` disables pulse, waveform animation, and layout motion that are not essential.

## Production component seams

```text
src/app/
  AppShell
  PrimaryNavigation
  GlobalStatusBanner
  PairingGate

src/features/playback/
  PlaybackProvider
  PlaybackDock
  MobileMiniPlayer
  WaveformSeekControl

src/features/generation/
  ScriptEditor
  GenerationStatus
  VoiceInspector
  RecentJobs

src/features/voices/
  VoiceCollection
  VoiceInspector
  VoiceCaptureDialog

src/features/history/
  HistoryToolbar
  HistoryList
  HistoryRow

src/features/settings/
  SettingsNavigation
  settings sections

src/lib/
  typed API client
  query keys
  route-independent preferences
```

Route modules coordinate queries and composition; they do not contain media implementations or multi-hundred-line subcomponents. Feature modules expose narrow interfaces and own their tests.

## Performance budgets

- Route-level code splitting: the shell does not eagerly import every page.
- Initial application JavaScript: target ≤125 kB gzip; no single lazy route target >150 kB gzip without an explicit exception.
- CSS: target ≤30 kB gzip.
- UI raster assets displayed as logos/avatars: normally ≤100 kB each and correctly dimensioned.
- Local warm navigation response: visible feedback within 100 ms.
- No cumulative layout shift from late status/player content.
- Lists avoid one audio element/canvas loop per row; only active/visible media work runs.

Budgets are release gates, not promises of network speed; bundle analysis records any accepted exception.

## Production verification scenarios

1. Wide, compact desktop, tablet, and mobile layouts for all routes.
2. Fresh empty state, populated state, loading, offline, authorization expiry, and API failure.
3. Generation queued, processing, cancelling, encoding, completed, failed, and interrupted.
4. Active playback across navigation, source replacement, expired audio, deletion race, and reload.
5. Voice upload, microphone denial/retry, recording limit, replacement, and deletion.
6. Keyboard-only and screen-reader smoke paths for every primary workflow.
7. Reduced motion, 200% zoom, long names/scripts, and high system text size where browser-supported.
