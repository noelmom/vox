# Repository Governance

This repository is public, but `main` is the stable product branch.

## Branches

- `main` — stable release branch. Only the maintainer merges here.
- `development` — active integration branch.
- Feature branches — branch from `development` unless the maintainer says otherwise.

## Required Public Workflow

1. Open an issue first.
2. Use the Bug report or Feature request issue template.
3. Enhancements must use the `enhancement` label.
4. Open a pull request linked to the issue.
5. CI must pass before merge.
6. Only the maintainer merges to `main`.

## Required Checks For `main`

The `main` branch protection should require:

- Pull request before merging
- At least one approving review
- Dismiss stale approvals when new commits are pushed
- Conversation resolution before merge
- Up-to-date branch before merge
- Status checks:
  - `Backend`
  - `Frontend`
  - `Shell scripts`
- No force pushes
- No deletions

## Maintainer Notes

Branch protection is configured in GitHub repository settings, not only in the repo files. If the repository is recreated, transferred, or rules are reset, reapply the settings above before accepting public pull requests.
