---
"wrangler": minor
---

CI/CD Improvements

## Changeset

Adding configuration allows for use of CLI for changesets. A necessary supplement to the changesets bot, and GitHub Action.

- Installed Changeset CLI tool
- NPX changeset init
  - Added changesets directory
  - Config
  - README
- Modified the config for `main` branch instead of `master`

## ESLint & Prettier Integration

Running Prettier as a rule through ESLint to improve CI/CD usage

- Added additional TypeScript support for ESLint
- Prettier errors as ESLint rule
- .vscode directory w/ settings.json config added that enforces
  the usage of ESLint by anyone working in the workspace
