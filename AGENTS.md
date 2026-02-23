# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## Project Overview

This is the **Cloudflare Workers SDK** monorepo containing tools and libraries for developing, testing, and deploying applications on Cloudflare. The main components are Wrangler (CLI), Miniflare (local dev simulator), and Create Cloudflare (project scaffolding).

## Development Commands

**Package Management:**

- Use `pnpm` - never use npm or yarn
- `pnpm install` - Install dependencies for all packages
- `pnpm build` - Build all packages (uses Turbo for caching)

**Testing:**

- `pnpm test:ci` - Run tests in CI mode
- `pnpm test:e2e` - Run end-to-end tests (requires Cloudflare credentials)
- `pnpm test -F <package> "pattern"` - Run a single test by name pattern

**Code Quality:**

- `pnpm check` - Run all checks (lint, type, format)
- `pnpm fix` - Auto-fix linting issues and format code

**Working with Specific Packages:**

- `pnpm run build --filter <package-name>` - Build specific package
- `pnpm run test:ci --filter <package-name>` - Test specific package
- `pnpm --filter <package> test:watch` - Watch mode for a specific package

## Architecture Overview

**Core Tools:**

- `packages/wrangler/` - Main CLI tool for Workers development and deployment
- `packages/miniflare/` - Local development simulator powered by workerd runtime
- `packages/create-cloudflare/` - Project scaffolding CLI (C3)
- `packages/vite-plugin-cloudflare/` - Vite plugin for Cloudflare Workers

**Development & Testing:**

- `packages/vitest-pool-workers/` - Vitest integration for testing Workers in actual runtime
- `packages/chrome-devtools-patches/` - Modified Chrome DevTools for Workers debugging

**Shared Libraries:**

- `packages/pages-shared/` - Code shared between Wrangler and Cloudflare Pages
- `packages/workers-shared/` - Code shared between Wrangler and Workers Assets
- `packages/workers-utils/` - Utility package for common Worker operations
- `packages/workflows-shared/` - Internal Cloudflare Workflows functionality
- `packages/containers-shared/` - Shared container functionality
- `packages/unenv-preset/` - Cloudflare preset for unenv (Node.js polyfills)
- `packages/cli/` - SDK for building workers-sdk CLIs
- `packages/kv-asset-handler/` - KV-based asset handling for Workers Sites

**Build System:**

- Turbo (turborepo) orchestrates builds across packages
- TypeScript compilation with shared configs in `packages/workers-tsconfig/`
- Shared ESLint config in `packages/eslint-config-shared/`
- Dependency management via pnpm catalog system

## WHERE TO LOOK

| Task                                           | Location                                       | Notes                                                            |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Add/modify a CLI command                       | `packages/wrangler/src/`                       | Commands registered in `src/index.ts` (2k+ line yargs tree)      |
| Change local dev behavior                      | `packages/miniflare/src/`                      | `src/index.ts` is the main `Miniflare` class                     |
| Modify Workers runtime simulation              | `packages/miniflare/src/workers/`              | ~30 embedded worker scripts, built via `worker:` virtual imports |
| Add a test fixture                             | `fixtures/`                                    | Each fixture is a full workspace member with own `package.json`  |
| Shared config types/validation                 | `packages/workers-utils/src/config/`           | `validation.ts` is the config normalizer (large file)            |
| Test helpers (runInTempDir, seed, mockConsole) | `packages/workers-utils/src/test-helpers/`     | Shared across wrangler, miniflare, others                        |
| Cloudflare API mocks for tests                 | `packages/wrangler/src/__tests__/helpers/msw/` | MSW handlers per API domain                                      |
| CI workflows                                   | `.github/workflows/`                           | `test-and-check.yml` is the primary gate                         |
| Build/deploy scripts                           | `tools/deployments/`                           | Validation + deployment helpers, run via `esbuild-register`      |
| Changeset config and rules                     | `.changeset/README.md`                         | Must read before creating changesets                             |

## Development Guidelines

**Requirements:**

- Node.js >= 20
- pnpm

**Code Style:**

- TypeScript with strict mode
- Use `import type { X }` for type-only imports (`@typescript-eslint/consistent-type-imports`)
- No `any` (`@typescript-eslint/no-explicit-any`)
- No non-null assertions (`!`)
- No floating promises - must be awaited or explicitly voided (`@typescript-eslint/no-floating-promises`)
- Always use curly braces for control flow (`curly: error`)
- Use `node:` prefix for Node.js imports (`import/enforce-node-protocol-usage`)
- Prefix unused variables with `_`
- No `.only()` in tests (`no-only-tests/no-only-tests`)
- Format with Prettier - run `pnpm prettify` in the workspace root before committing
- All changes to published packages require a changeset (see below)

**Formatting (Prettier):**

- Tabs (not spaces), double quotes, semicolons, trailing commas (es5)
- Import order enforced: builtins → third-party → parent → sibling → index → types
- `prettier-plugin-packagejson` sorts package.json keys

**Security:**

- Custom ESLint rule `workers-sdk/no-unsafe-command-execution`: no template literals or string concatenation in `exec`/`spawn`/`execFile` calls (command injection prevention, CWE-78). Disabled in test files only.

**Dependencies:**

- Packages must bundle deps into distributables; runtime `dependencies` are forbidden except for an explicit allowlist
- External (non-bundled) deps must be declared in `scripts/deps.ts` with `EXTERNAL_DEPENDENCIES` and a comment explaining why

**Testing Standards:**

- Unit tests with Vitest for all packages
- Fixture tests in `/fixtures` directory for filesystem/Worker scenarios
- E2E tests require real Cloudflare account credentials
- Use `vitest-pool-workers` for testing actual Workers runtime behavior
- Shared vitest config (`vitest.shared.ts`): 50s timeouts, `retry: 2`, `restoreMocks: true`

**Git Workflow:**

- Check you are not on main before committing. Create a new branch for your work from main if needed.
- Clean commit history required before first review
- Don't squash commits after review
- Never commit without changesets for user-facing changes
- PR template requirements: Remove "Fixes #..." line when no relevant issue exists, keep all checkboxes (don't delete unchecked ones)

**Creating Pull Requests:**

- Always use the PR template from `.github/PULL_REQUEST_TEMPLATE.md` - do not replace it with your own format
- Fill in the template: replace the issue link placeholder, add description, check appropriate boxes
- Keep all checkboxes in the template (don't delete unchecked ones)
- PR title format: `[package name] description` (e.g. `[wrangler] Fix bug in dev command`)
- If the change doesn't require a changeset, add the `no-changeset-required` label

## Key Locations

- `/fixtures` - Test fixtures and example applications (each a workspace member)
- `/packages/wrangler/src` - Main Wrangler CLI source code
- `/packages/miniflare/src` - Miniflare source
- `/tools` - Build scripts and deployment utilities (run via `esbuild-register`, no build step)
- `turbo.json` - Turbo build configuration
- `pnpm-workspace.yaml` - Workspace configuration (~156 workspace members)

## Testing Strategy

**Package-specific tests:** Most packages have their own test suites
**Integration tests:** Use fixtures to test real-world scenarios
**E2E tests:** Test against actual Cloudflare services (requires auth)
**Workers runtime tests:** Use vitest-pool-workers for workerd-specific behavior

Run `pnpm check` before submitting changes to ensure all quality gates pass.

## Changesets

Every change to package code requires a changeset or it will not trigger a release. Read `.changeset/README.md` before creating changesets.

**Changeset Format:**

The changeset descriptions can either use conventional commit prefixes (e.g., "fix: remove unused option") or
start with a capital letter and describe the change directly (e.g., "Remove unused option" not").

**Changeset Rules:**

- Major versions for `wrangler` are currently **forbidden**
- `patch`: bug fixes; `minor`: new features, deprecations, experimental breaking changes; `major`: stable breaking changes only
- No h1/h2/h3 headers in changeset descriptions (changelog uses h3)
- Config examples must use `wrangler.json` (JSONC), not `wrangler.toml`
- Separate changesets for distinct changes; do not lump unrelated changes

## Anti-Patterns

These are explicitly forbidden across the repo:

- **npm/yarn** → use pnpm
- **`any` type** → properly type everything
- **Non-null assertions (`!`)** → use type narrowing
- **Floating promises** → await or void explicitly
- **Missing curly braces** → always brace control flow
- **`console.*` in wrangler** → use the `logger` singleton
- **Direct Cloudflare REST API calls** → use the Cloudflare TypeScript SDK
- **Named imports from `ci-info`** → use default import (`import ci from "ci-info"`)
- **Runtime dependencies** → bundle deps; external deps need explicit allowlist entry
- **Committing to main** → always work on a branch

## Subdirectory Knowledge

Packages with their own AGENTS.md for deeper context:

- `packages/wrangler/AGENTS.md` - CLI architecture, command structure, test patterns
- `packages/miniflare/AGENTS.md` - Worker simulation, embedded workers, build system
- `packages/vite-plugin-cloudflare/AGENTS.md` - Plugin architecture, playground setup
- `packages/create-cloudflare/AGENTS.md` - Scaffolding, template system
- `packages/vitest-pool-workers/AGENTS.md` - 3-context architecture, cloudflare:test module
- `packages/workers-utils/AGENTS.md` - Shared config validation, test helpers
