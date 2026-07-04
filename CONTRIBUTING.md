# Contributing

Thanks for your interest in Vox.

Vox is a local macOS voice studio, so changes need to protect the stable installer, local data, and on-device generation flow.

## Workflow

1. Open an issue first.
   - Bugs should use the Bug report template.
   - Features and post-v1 ideas should use the Feature request template and the `enhancement` label.
2. Wait for maintainer agreement on scope before implementing feature work.
3. Open a pull request linked to the issue.
4. Keep changes focused. Avoid unrelated refactors in product fixes.
5. CI must pass before merge.

## Branches

- `main` is the stable release branch.
- `development` is the active integration branch.
- Feature branches should be created from `development` unless a maintainer says otherwise.

Only the maintainer merges to `main`. Direct commits to `main` are not part of the public workflow.

## Required Checks

Run the checks that match your change:

```bash
ruff check api tests
pytest
npm --prefix ui-src run typecheck
npm --prefix ui-src run build
bash -n vox.sh setup.sh scripts/*.sh pkg-scripts/*
```

The GitHub Actions CI runs backend lint/tests, spellcheck, frontend typecheck/build, and shell syntax checks for pushes and pull requests.

## Product Scope

Before v1.0, only bug fixes, polish, documentation accuracy, release hardening, and true blockers should be merged.

Post-v1 feature ideas belong in GitHub Issues with the `enhancement` label. The backlog is useful for planning, but issues are the source of truth for public tracking.

## Release Notes

User-facing changes should update `CHANGELOG.md` when they affect behavior, installation, public documentation, or release packaging.
