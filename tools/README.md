# Continuous Integration (CI) tools

Tools for helping with CI

- `deployments/deploy-non-npm-packages()` - Deploy all packages that had updates but are not deployed to npm automatically by the changesets tooling.
  This is used by the changesets.yml GitHub workflow to deploy non-npm packages (e.g. Workers and Pages projects).

- `deployments/ensure-fixtures-are-not-deployable.ts` - Ensures that we don't accidentally create git tags and releases for fixtures by someone inadvertently adding a version to their package.json or making them non-private.
  Used by test-and-check.yml GitHub Action workflows, as part of the `check` npm script.

- `deployments/validate-changesets.ts` - Validate that changesets are formatted correctly.
  Used by the changesets.yml and test-and-check.yml GitHub Action workflows.

- `deployments/validate-pinned-dependencies.ts` - Ensures all non-bundled dependencies of published packages (and all pnpm catalog entries) are pinned to exact versions.
  Used by the test-and-check.yml GitHub Action workflow, as part of the `check` npm script (`pnpm check:pinned-deps`).

- `dependabot/generate-dependabot-pr-changesets.ts` - Generates and commits a changeset for a Dependabot PR.
  Used by the c3-dependabot-versioning-prs.yml and miniflare-dependabot-versioning-prs.yml GitHub Action workflows.

- `e2e/e2eCleanup.ts` - Ensures that any orphaned Pages projects and Workers that were left behind from e2e tests are deleted.

- `e2e/runIndividualE2EFiles.ts` - Used to shard the e2e tests into separately cache-able Turbo runs, which helps with flakey tests.

- `test/check-built-entry-points.ts` - Checks that the built Wrangler and Vite plugin declarations resolve in a temporary consumer project. Also checks that Wrangler's CLI and experimental config entry points load in Node.
  CI runs the checks after building. Locally, run `pnpm run build --filter=wrangler --filter=@cloudflare/vite-plugin`, then run the check for the package you want:

  ```sh
  # Wrangler: check the packaged runtime as well as the built declarations.
  pnpm --filter wrangler pack --out "${TMPDIR:-/tmp}/wrangler.tgz"
  node -r esbuild-register tools/test/check-built-entry-points.ts wrangler "${TMPDIR:-/tmp}/wrangler.tgz"

  # Vite plugin: no tarball needed.
  node -r esbuild-register tools/test/check-built-entry-points.ts vite-plugin-cloudflare
  ```

- `test/run-test-file.ts` - Used by in VS Code configuration to launch a debug session to run a single test file.

- `test-workers/` - Contains worker definitions used by CI tests. Each worker has its own subdirectory with `index.js` and `wrangler.jsonc` files. See `test-workers/README.md` for details.
