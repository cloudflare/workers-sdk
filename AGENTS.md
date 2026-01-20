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

**Testing Standards:**

- Unit tests with Vitest for all packages
- Fixture tests in `/fixtures` directory for filesystem/Worker scenarios
- E2E tests require real Cloudflare account credentials
- Use `vitest-pool-workers` for testing actual Workers runtime behavior

**Git Workflow:**

- Check you are not on main before committing. Create a new branch for your work from main if needed.
- Clean commit history required before first review
- Never commit without changesets for user-facing changes
- PR template requirements: Remove "Fixes #..." line when no relevant issue exists, keep all checkboxes (don't delete unchecked ones)

**Creating Pull Requests:**

- Always use the PR template from `.github/PULL_REQUEST_TEMPLATE.md` - do not replace it with your own format
- Fill in the template: replace the issue link placeholder, add description, check appropriate boxes
- Keep all checkboxes in the template (don't delete unchecked ones)
- PR title format: `[package name] description` (e.g. `[wrangler] Fix bug in dev command`)
- If the change doesn't require a changeset, add the `no-changeset-required` label

## Key Locations

- `/fixtures` - Test fixtures and example applications
- `/packages/wrangler/src` - Main Wrangler CLI source code
- `/packages/miniflare/src` - Miniflare source
- `/tools` - Build scripts and deployment utilities
- `turbo.json` - Turbo build configuration
- `pnpm-workspace.yaml` - Workspace configuration

## Testing Strategy

**Package-specific tests:** Most packages have their own test suites
**Integration tests:** Use fixtures to test real-world scenarios
**E2E tests:** Test against actual Cloudflare services (requires auth)
**Workers runtime tests:** Use vitest-pool-workers for workerd-specific behavior

Run `pnpm check` before submitting changes to ensure all quality gates pass.

## Changesets

Every change to package code requires a changeset or it will not trigger a release. Read `.changeset/README.md` before creating changesets.

**Changeset Format:**

- Do not use conventional commit prefixes (e.g., `fix:`, `feat:`) in changeset descriptions
- Start with a capital letter and describe the change directly (e.g., "Remove unused option" not "fix: remove unused option")
