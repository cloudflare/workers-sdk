# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Cloudflare Workers SDK** monorepo containing tools and libraries for developing, testing, and deploying serverless applications on Cloudflare's edge network. The main components are Wrangler (CLI), Miniflare (local dev simulator), and Create Cloudflare (project scaffolding).

## Development Commands

**Package Management:**

- Use `pnpm` - never use npm or yarn
- `pnpm install` - Install dependencies for all packages
- `pnpm build` - Build all packages (uses Turbo for caching)

**Testing:**

- `pnpm test:ci` - Run tests in CI mode
- `pnpm test:e2e` - Run end-to-end tests (requires Cloudflare credentials)

**Code Quality:**

- `pnpm check` - Run all checks (lint, type, format)
- `pnpm fix` - Auto-fix linting issues and format code

**Working with Specific Packages:**

- `pnpm run build --filter <package-name>` - Build specific package
- `pnpm run test:ci --filter <package-name>` - Test specific package

## Architecture Overview

**Core Tools:**

- `packages/wrangler/` - Main CLI tool for Workers development and deployment
- `packages/miniflare/` - Local development simulator powered by workerd runtime
- `packages/create-cloudflare/` - Project scaffolding CLI (C3)

**Development & Testing:**

- `packages/vitest-pool-workers/` - Vitest integration for testing Workers in actual runtime
- `packages/chrome-devtools-patches/` - Modified Chrome DevTools for Workers debugging

**Shared Libraries:**

- `packages/pages-shared/` - Code shared between Wrangler and Cloudflare Pages
- `packages/workers-shared/` - Code shared between Wrangler and Workers Assets

**Build System:**

- Turbo (turborepo) orchestrates builds across packages
- TypeScript compilation with shared configs in `packages/workers-tsconfig/`
- Dependency management via pnpm catalog system

## Development Guidelines

**Requirements:**

- Node.js >= 20
- pnpm

**Code Style:**

- All significant changes require a changeset: `pnpm changeset`

**Testing Standards:**

- Unit tests with Vitest for all packages
- Fixture tests in `/fixtures` directory for filesystem/Worker scenarios
- E2E tests require real Cloudflare account credentials
- Use `vitest-pool-workers` for testing actual Workers runtime behavior

**Git Workflow:**

- Clean commit history required before first review
- Never commit without changesets for user-facing changes
- PR template requirements: Remove "Fixes #..." line when no relevant issue exists, keep all checkboxes (don't delete unchecked ones)

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

## Keeping CLAUDE.md up to date

IMPORTANT. Whenever you discover or are told new information that would be relevant to future instances of Claude Code, include it in CLAUDE.md
