# Miniflare — Agent Guide

## Overview

Local dev simulator for Cloudflare Workers, powered by workerd runtime. Main class `Miniflare` in `src/index.ts`.

## Structure

- `src/index.ts` — Main `Miniflare` class, server setup, plugin orchestration, all exports
- `src/workers/` — ~30 embedded worker scripts (D1, KV, R2, caches, etc.), built via `worker:` virtual import scheme
- `src/workers/shared/` — Shared utilities across embedded workers
- `src/runtime/config/generated/workerd.ts` — Generated workerd Cap'n Proto config types
- `test/` — Tests (`.spec.ts` naming, NOT `.test.ts`)
- `test/test-shared/` — Shared test utilities
- `bootstrap.js` — Deprecated CLI stub (prints error directing to `wrangler dev`)
- `scripts/build.mjs` — Custom esbuild build script

## Build

- Custom `scripts/build.mjs` bundles `src/index.ts` as CJS → `dist/src/index.js`
- Also compiles ~30 embedded worker scripts via `worker:...` virtual import scheme — each triggers a nested esbuild sub-build producing standalone ESM worker scripts
- Build outputs: `dist/`, `bootstrap.js`, `worker-metafiles/`

## Lint Status (Transitional)

- Many shared ESLint rules temporarily DISABLED: `curly`, `no-explicit-any`, `consistent-type-imports`, `no-shadow`, `no-floating-promises`, others
- Comment in config: "temporarily enabled while we transition Miniflare to use the standard workers-sdk eslint config"
- `no-console: error` is on, except for `src/workers/` and `scripts/`

## TypeScript

- Does NOT extend shared `@cloudflare/workers-tsconfig` — has its own full config
- Uses `experimentalDecorators`
- Path aliases: `miniflare:shared`, `miniflare:zod`
- `declaration: true` (emits .d.ts)

## Testing

- Test files use `.spec.ts` (NOT `.test.ts`)
- `pool: "forks"`, `singleFork: true`
- Does NOT extend `vitest.shared.ts` — own full vitest config
- Timeouts: 30s test, 30s hook
- `globals: true`
- Factory pattern: `miniflareTest(opts, handler?)` creates instance in `beforeAll`, disposes in `afterAll`
- `useDispose(mf)` / `disposeWithRetry()` — exponential backoff for Windows EPERM file locking
- `useServer()` — temp HTTP server with auto-cleanup
- `TestLog` — captures log entries by level

## Version Pinning

- Miniflare minor version must match workerd minor version
- `.github/changeset-version.js` enforces this: if changeset bumps miniflare minor beyond workerd's, it converts to patch
