# AGENTS.md

This file helps AI coding agents work effectively in the Cloudflare Workers SDK
monorepo. Prefer authoritative configuration and documentation over copying
details into this file: copied versions, rule lists, and counts become stale.

## Start Here

- Use `pnpm`, not npm or yarn.
- Use the Node.js and pnpm versions declared in `package.json`.
- Install dependencies with `pnpm install`.
- Run commands from the workspace root unless package documentation says
  otherwise.
- Before changing a package, read its `AGENTS.md` if it has one.
- Do not edit generated files directly. Change their source or generator and
  regenerate them.

## Common Commands

The root `package.json` is authoritative for available scripts.

- `pnpm build` — build the workspace with Turbo.
- `pnpm test:ci` — run tests in CI mode.
- `pnpm test:e2e` — run end-to-end tests; many require Cloudflare credentials.
- `pnpm check` — run the repository's validation, lint, type, and format checks.
- `pnpm fix` — apply supported lint and formatting fixes.
- `pnpm prettify` — format files with oxfmt.
- `pnpm run <script> --filter <package>` — run a Turbo task for one package.
- `pnpm -w test:ci -F <package> -- <test-file>` — run a package's specific test
  file when its test configuration supports it.

Prefer the narrowest relevant test while developing, then run the broader
package checks appropriate to the change. Do not run credentialed E2E tests
unless the task and environment support them.

## Repository Map

| Task                                        | Location                                                              | Notes                                                         |
| ------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Add or modify a Wrangler command            | `packages/wrangler/src/`                                              | Commands are registered from `src/index.ts`.                  |
| Change local development behavior           | `packages/miniflare/src/`                                             | `src/index.ts` contains the main `Miniflare` class.           |
| Modify embedded runtime workers             | `packages/miniflare/src/workers/`                                     | Worker scripts use `worker:` virtual imports.                 |
| Change project scaffolding                  | `packages/create-cloudflare/`                                         | Templates and framework support live here.                    |
| Change the Vite integration                 | `packages/vite-plugin-cloudflare/`                                    | Includes package-specific playgrounds.                        |
| Change the Vitest integration               | `packages/vitest-plugin/`                                             | Vitest integration for tests running in workerd.              |
| Change shared config handling               | `packages/workers-utils/src/config/`                                  | Shared types, normalization, and validation.                  |
| Use shared test helpers                     | `packages/workers-utils/src/test-helpers/`                            | Includes temporary-directory and console helpers.             |
| Change deploy or versions-upload validation | `packages/deploy-helpers/src/deploy/helpers/validate-worker-props.ts` | Keep deploy and versions-upload behavior aligned.             |
| Add a fixture                               | `fixtures/`                                                           | Fixtures are workspace members with their own `package.json`. |
| Change CI                                   | `.github/workflows/`                                                  | `test-and-check.yml` is the main test workflow.               |
| Change deployment tooling                   | `tools/deployments/`                                                  | Scripts run directly through `esbuild-register`.              |
| Create a changeset                          | `.changeset/README.md`                                                | Read this file before deciding whether one is required.       |

Turbo orchestrates workspace tasks. Shared TypeScript configuration lives in
`packages/workers-tsconfig/`; lint and formatting behavior is defined by
`.oxlintrc.jsonc`, `.oxfmtrc.jsonc`, and `packages/lint-config-shared/`.

## Cross-Tool Development Features

Wrangler, the Vite plugin, and the Vitest plugin are all consumers of the
Workers development platform. A development feature is not complete merely
because it works through one of them.

Implement development features in Miniflare wherever possible so that every
consumer benefits from the same behavior. Keep the integration layers in
Wrangler, the Vite plugin, and the Vitest plugin thin instead of implementing
equivalent behavior independently in each tool. If Miniflare is not the
appropriate layer, put shared behavior in the lowest suitable shared package.

When adding or changing development functionality:

- assess its impact on Miniflare, Wrangler, the Vite plugin, and the Vitest
  plugin;
- update shared configuration types, validation, and runtime behavior where
  applicable;
- add coverage at the shared implementation layer; add consumer-specific tests
  when the consumer's integration or behavior is affected;
- document intentional differences or unsupported consumers in the change and
  pull request.

## Implementation Conventions

The checked-in configuration is authoritative. Run `pnpm check` rather than
relying on a duplicated list of every enforced rule. In particular:

- Keep TypeScript strictly typed. Avoid `any`, non-null assertions, and floating
  promises.
- Use type-only imports where appropriate and `node:` prefixes for Node.js
  built-ins.
- Prefer function declarations for named or exported functions.
- Add well-formatted JSDoc to exported or public functions and to functions whose
  purpose is not evident, including useful tags such as `@param` and `@returns`
  where appropriate.
- Comments should explain why; do not add comments that merely restate code.
- Lint-disable comments require a reason after `--`.
- In Wrangler, use the logger rather than calling `console.*` directly, except
  inside the logger implementation.
- Use the Cloudflare TypeScript SDK rather than adding direct REST API calls.
- Import `ci-info` through its default export.

oxfmt determines whitespace, quoting, import order, and package.json sorting.
Do not reproduce those rules manually; run `pnpm prettify`.

## Dependencies and Security

- Packages normally bundle their dependencies. The repository validator in
  `tools/deployments/validate-package-dependencies.ts` is authoritative.
- A package that must leave a dependency external declares it in that package's
  `scripts/deps.ts` as part of `EXTERNAL_DEPENDENCIES`, with an explanation.
- After changing dependencies, run `pnpm install` so that the lockfile is
  updated.
- Do not build shell commands with interpolated or concatenated untrusted input.
  The custom `workers-sdk/no-unsafe-command-execution` oxlint rule enforces the
  repository's command-execution constraints.

## Testing Conventions

- Use Vitest for unit and integration tests.
- Use fixtures for filesystem and Worker scenarios; treat fixtures as
  user-facing examples and keep them clear and realistic.
- Use the Vitest plugin when behavior must be tested in workerd.
- In Vitest tests, obtain `expect` from the test context rather than importing
  it from `vitest`. Pass `ExpectStatic` to helpers that need it; use
  `node:assert` where test context is unavailable.
- Prefer `runInTempDir()` and real filesystem operations over filesystem mocks.
- Use `mockConsoleMethods()` to capture output and assert against its `out`,
  `err`, and `warn` properties.
- Update relevant snapshots when changing user-facing output.
- New examples under `fixtures/vitest-plugin-examples/` need a
  `tsconfig.json`.

The shared defaults are defined in `vitest.shared.ts`; package configurations
may override them.

## Changes and Pull Requests

- Work on a branch rather than committing directly to `main`.
- Read `.changeset/README.md` to determine whether a changeset is required and
  how to write it. Do not assume every package-code change needs one.
- Use `.github/PULL_REQUEST_TEMPLATE.md` when preparing a pull request.
- The PR description requirements are enforced by
  `tools/deployments/validate-pr-description.ts`; treat that validator and the
  template as authoritative.
- Use the repository's established `[package] description` PR-title style.
- Run the relevant tests and checks locally before pushing.

## Package-Specific Guidance

Many packages provide their own `AGENTS.md`. Locate and read the closest
applicable file before making changes. When a change makes guidance inaccurate,
update that file in the same change. Put package-specific knowledge in the
package's file; keep this root file focused on repository-wide workflow and
navigation.
