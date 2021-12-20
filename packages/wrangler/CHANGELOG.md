# wrangler

## 0.0.0

### Minor Changes

- 689cd55: CI/CD Improvements

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

### Patch Changes

- b0fcc7d: CI/CD Tests & Type Checking
  GH Workflow additions:

  - Added Testing script
  - Added Linting script
  - tsc is using skipLibCheck as a current workaround
    - TODO added for future removal
  - Runs on every Pull Request instance
  - Removed npm ci in favor of npm install
    - Removed --prefer-offline in favor of local cache artifact

- 2f760f5: remove `--polyfill-node`
- fd53780: `kv:key put`: make only one of `value` or `--path <path>` necessary
- dc41476: Added optional shortcuts
- 7858ca2: Removed NPM registry and timeout from CI
- 85b5020: Make `wrangler dev` work with durable objects
