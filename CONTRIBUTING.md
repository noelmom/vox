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

Run the complete local quality loop before pushing:

```bash
bash scripts/ci-local.sh
```

Use a clean-cache run before handing off a release-sized change:

```bash
bash scripts/ci-local.sh --clean
```

The script creates an isolated Python environment, installs the locked Python and frontend dependencies, and runs backend lint/tests, spellcheck, frontend lint/typecheck/unit/accessibility/browser tests, the production UI build and generated-output check, shell validation, and a native helper compile. Human-readable logs and a machine-readable `summary.json` are written under `.ci/results/`.

GitHub Actions keeps the existing hosted checks for `main` and pull requests. Pushes and same-repository pull requests to `redesign` also run the same local quality loop on the repository's labeled self-hosted macOS runner, so redesign work does not consume hosted runner minutes. Fork pull requests never execute on the trusted local runner.

## Product Scope

Before v1.0, only bug fixes, polish, documentation accuracy, release hardening, and true blockers should be merged.

Post-v1 feature ideas belong in GitHub Issues with the `enhancement` label. The backlog is useful for planning, but issues are the source of truth for public tracking.

## Release Notes

User-facing changes should update `CHANGELOG.md` when they affect behavior, installation, public documentation, or release packaging.
