# GitHub Actions

See below for a summary of this repo's Actions

- _Actions marked with "⚠️" are expected to sometimes fail._

## Security auditing

We use [`zizmor`](https://docs.zizmor.sh/) to audit GitHub Actions workflow definitions and keep CI workflows as safe as possible. When changing files in this directory, run:

```sh
zizmor .github/workflows/*.yml
```

Workflow changes should avoid unsuppressed `zizmor` findings. In particular:

- Pin external actions to immutable commit SHAs, not tags.
- Use `actions/checkout` v6 or newer so persisted credentials are stored under `$RUNNER_TEMP`; set `persist-credentials: false` when a job does not need follow-up authenticated Git operations.
- Pass GitHub expression values into shell steps through `env` instead of expanding `${{ ... }}` directly inside `run` blocks.
- Treat privileged triggers such as `pull_request_target` and `workflow_run` as security-sensitive. If a privileged trigger is required, document the safety model and add a targeted `zizmor` ignore with a reason.

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
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `ci:run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

### Vite Plugin E2E tests (e2e-vite.yml)

- Triggers
  - Updates to PRs on the Cloudflare fork.
  - PRs in the merge queue.
- Actions
  - Runs the E2E tests for the Vite plugin.
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `ci:run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

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

### Triage Issue (triage-issue.yml)

- Triggers
  - A new issue is opened (skips PRs and bot-authored issues).
  - A new comment is created on an issue — re-triages with the latest context. Skips PRs, bot comments, and the triage bot's own report comment (matched by a marker) to avoid re-triage loops.
  - Manual `workflow_dispatch` with an `issue-number` input.
- Actions
  - Runs an OpenCode agent with the `.github/skills/issue-review.md` skill against the pre-fetched issue data (including existing comments) to produce a markdown triage report (`report.md`) and a structured JSON summary (`summary.json`).
  - Uploads the report to the triage dashboard.
  - Posts the report and structured summary as a maintainer-facing comment on the issue and applies the suggested labels (validated against existing repo labels). The comment carries a hidden marker so that re-triage updates the existing comment (via `gh`) rather than posting a duplicate. Comments and labels are attributed to the workers-devprod bot via `GH_ACCESS_TOKEN`.
  - The AI agent itself runs sandboxed (no shell or network access); all GitHub writes happen in workflow steps from the generated files.

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
- Tiered publishing
  - Instead of `changeset publish`, the `publish` step runs `tools/deployments/publish-packages.ts`.
  - Packages pin their workspace siblings at an exact version (`workspace:*` is rewritten to the sibling's version at pack time). If a dependent lands on npm before its dependency has propagated, `npm install` of the dependent fails for the window in between — the release is published but broken.
  - The orchestrator therefore groups packages into dependency tiers (currently three: `miniflare` and friends, then `wrangler`, then `@cloudflare/vite-plugin` / `@cloudflare/vitest-plugin`) and publishes tier by tier. Packages within a tier publish in parallel, bounded by `PUBLISH_CONCURRENCY`.
  - Between tiers it polls the registry until every version just published is resolvable _and_ its tarball is fetchable, then waits a further `PUBLISH_PROPAGATION_MIN_SECONDS` — a successful read only proves the release runner's own CDN edge is up to date. That settle time is unconditional rather than a floor on the total gate duration: other edges can only serve a version once it is retrievable from the origin, and the first successful read is the best available proxy for when that happened. If a version never appears within `PUBLISH_PROPAGATION_TIMEOUT_SECONDS`, the release fails instead of publishing a broken dependent.
  - Only `dependencies`/`peerDependencies`/`optionalDependencies` create ordering. `devDependencies` are excluded: consumers never install them, and including them would create cycles because packages like `wrangler` dev-depend on their own dependents.
  - Packages whose exact version is already on npm are skipped, so re-running a partially failed release picks up only what is still missing. That "is it already published?" check runs once per tier _during_ the release, so its reads are retried (`PUBLISH_READ_RETRY_ATTEMPTS`, with exponential backoff) — otherwise one transient 5xx while checking a later tier would abort a run that had already published earlier tiers. A 404 is not retried, since it legitimately means "not published yet".
  - If any package in a tier fails, later tiers are not attempted and **no git tags are created**, so a re-run retries cleanly. Tags are created at the very end by `changeset tag`, which also emits the `New tag:` lines that `changesets/action` parses into its `publishedPackages` output (consumed by the non-npm deployment step).
  - Run `node -r esbuild-register tools/deployments/publish-packages.ts --dry-run` to print the computed tiers without publishing.

## C3 related actions

### C3 E2E Tests (c3-e2e.yml)

- Triggers
  - Updates to PRs.
- Actions
  - Runs the E2E tests for C3.
  - Cloudflare API credentials are only passed on Version Packages PRs (`changeset-release/main`), in the merge queue, or when the `ci:run-remote-tests` label is applied. Other PRs run the E2E suite without remote tests.

### Rerun Code Owners (rerun-codeowners.yml + rerun-codeowners-privileged.yml)

- Triggers
  - A review is submitted or dismissed on a PR.
- Actions
  - Re-runs the "Run Codeowners Plus" check so it re-evaluates approval status after the review change.
  - Uses the `workflow_run` pattern: the trigger workflow exists solely to fire a `workflow_run` event; the privileged companion workflow (which has full permissions) reads the PR head SHA from `github.event.workflow_run.head_sha` and performs the re-run. This is necessary because `pull_request_review` gives a read-only token for fork PRs and has no `_target` variant.

### Rerun Remote Tests (rerun-remote-tests.yml)

- Triggers
  - The `ci:run-remote-tests` or `run-c3-frameworks-tests` label is added to or removed from a PR.
- Actions
  - Re-runs the E2E workflows for the PR so they pick up the label change and pass (or withhold) API credentials to the test steps.
  - `ci:run-remote-tests` re-runs Wrangler, Vite, and C3 E2E workflows; `run-c3-frameworks-tests` re-runs only C3 E2E.
  - Uses `pull_request_target` to get a privileged token even for fork PRs (safe because no untrusted code is checked out).
