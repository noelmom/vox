# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub Issues. Use the `gh` CLI for all operations.

## Conventions

- Create, read, comment on, label, and close issues with the corresponding `gh issue` command.
- Infer the repository from the configured `origin` remote.

## Pull requests as a triage surface

PRs as a request surface: no. External PRs are not part of the triage workflow.

## Wayfinding operations

- A map is one issue labelled `wayfinder:map`.
- Child tickets reference the map with `Part of #<map-number>` and carry a `wayfinder:<type>` label.
- Add an assignee to claim a ticket before working it.
- Use native GitHub issue dependencies when available; otherwise record `Blocked by: #<number>` in the child issue body.
- Resolve a ticket with a resolution comment, close it, then append a linked one-line decision to the map.
