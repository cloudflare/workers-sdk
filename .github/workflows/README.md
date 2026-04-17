# GitHub Actions

See below for a summary of this repo's Actions

- _Actions marked with "⚠️" are expected to sometimes fail._

## PR related actions

### Tests + Checks (test-and-check.yml)

- Triggers
  - Updates to PRs.
  - PRs in the merge queue.
- Actions
  - Builds all the packages.
  - Runs formatting, linting and type checks.
  - Runs fixture tests, Wrangler unit tests, C3 unit tests, Miniflare unit tests, and ESLint + Prettier checks.
  - Adds the PR to a GitHub project
  - Makes sure that Wrangler's warning for old Node.js versions works.

### Wrangler E2E tests (e2e-wrangler.yml)

- Triggers
  - Updates to PRs on the Cloudflare fork.
  - PRs in the merge queue.
- Actions
  - Runs the E2E tests for Wrangler.
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

### Vite Plugin E2E tests (e2e-vite.yml)

- Triggers
  - Updates to PRs on the Cloudflare fork.
  - PRs in the merge queue.
- Actions
  - Runs the E2E tests for the Vite plugin.
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

## Deploy Pages Previews (deploy-pages-preview.yml)

- Triggers
  - Updates to PRs that have one of the `preview:...` labels.
- Actions
  - Deploy a preview of the matching Pages project to Cloudflare.

## Deploy (to testing) and Test Playground Preview Worker (worker-playground-preview-testing-env-deploy-and-test.yml)

- Triggers
  - Commits merged to the `main` branch, on the Cloudflare fork, which touch files in the `packages/playground-preview-worker` directory.
  - Updates to PRs, on the Cloudflare fork, with the `playground-worker` label applied.
- Actions
  - Runs integrations tests to ensure the behaviour of the Worker powering the Workers Playground.

## Create Pull Request Prerelease (prerelease.yml)

- Triggers
  - Updates to PRs.
- Actions
  - Creates an installable pre-release of any package containing `{ "workers-sdk": { "prerelease": true } }` in its `package.json` (e.g. Wrangler, C3, and Miniflare) on every PR.
  - Adds a comment to the PR with links to the pre-releases.

## Housekeeping actions

### Add issues to DevProd project (issues.yml)

- Triggers
  - Updates to issues.
- Actions
  - Add the issue to a GitHub project.

### Generate changesets for dependabot PRs (c3-dependabot-versioning-prs.yml and miniflare-dependabot-versioning-prs.yml)

- Triggers
  - Updates to PRs, by the dependabot user, which update one of:
    - frameworks dependencies in C3,
    - miniflare.
- Actions
  - Generates changesets for the affected package.

### E2E Project Cleanup (e2e-project-cleanup.yml)

- Triggers
  - Scheduled to run at 3am each day.
- Actions
  - Deletes any Workers and Pages projects that were not properly cleaned up by the E2E tests.

## Main branch actions

### Handle Changesets (changesets.yml)

- Triggers
  - Commits merged to the `main` branch, on the Cloudflare fork.
- Actions
  - If there are changeset in the working directory, create or update a "Version Packages" PR to prep for a release.
  - If there are no changesets, release any packages that have a bump to their version in this change.
    - Public packages are deployed to npm
    - Private packages will run their `deploy` script, if they have one.

## C3 related actions

### C3 E2E Tests (c3-e2e.yml)

- Triggers
  - Updates to PRs.
- Actions
  - Runs the E2E tests for C3.
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

### Rerun Code Owners (rerun-codeowners.yml + rerun-codeowners-privileged.yml)

- Triggers
  - A review is submitted or dismissed on a PR.
- Actions
  - Re-runs the "Run Codeowners Plus" check so it re-evaluates approval status after the review change.
  - Uses the `workflow_run` pattern: the trigger workflow exists solely to fire a `workflow_run` event; the privileged companion workflow (which has full permissions) reads the PR head SHA from `github.event.workflow_run.head_sha` and performs the re-run. This is necessary because `pull_request_review` gives a read-only token for fork PRs and has no `_target` variant.

### Rerun Remote Tests (rerun-remote-tests.yml)

- Triggers
  - The `run-remote-tests` or `run-c3-frameworks-tests` label is added to or removed from a PR.
- Actions
  - Re-runs the E2E workflows for the PR so they pick up the label change and pass (or withhold) API credentials to the test steps.
  - `run-remote-tests` re-runs Wrangler, Vite, and C3 E2E workflows; `run-c3-frameworks-tests` re-runs only C3 E2E.
  - Uses `pull_request_target` to get a privileged token even for fork PRs (safe because no untrusted code is checked out).
