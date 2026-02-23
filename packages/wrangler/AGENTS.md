# Wrangler — Agent Guide

Wrangler-specific context only. See root `AGENTS.md` for monorepo conventions.

## Overview

Main CLI for Cloudflare Workers. ~2k-line yargs command tree in `src/index.ts`. Entry point is `src/cli.ts` (NOT `src/index.ts`).

## Structure

- `src/` — CLI source
- `src/__tests__/` — Unit tests, helpers in `src/__tests__/helpers/`
- `e2e/` — E2E tests, requires Cloudflare credentials
- `bin/wrangler.js` — Shim that spawns Node with `--experimental-vm-modules`
- `templates/` — Worker templates

## Entry Points

- `src/cli.ts` — Build entry AND library API surface (dual-purpose). Calls `main()` when run directly; re-exports `./api` when imported as library.
- `src/index.ts` — Yargs CLI tree builder (large file). Exports `main()`. NOT the package entry point despite the name.
- `src/api/index.ts` — Public programmatic API barrel.

## Conventions (Wrangler-Specific)

- No `console.*` — use `logger` singleton
- No `__dirname` / `__filename` — use `getBasePath()`
- No global `fetch` — use undici's fetch
- No direct Cloudflare REST API calls — use the Cloudflare TypeScript SDK

## Build

- tsup: single entry `src/cli.ts` → `wrangler-dist/cli.js`
- `package.json` `main` points at `wrangler-dist/cli.js`
- Custom `embedWorkersPlugin()` bundles Worker templates via esbuild for tests

## Testing

- Pool: `"forks"` (not threads) — heavy global mocking
- `runWrangler(cmd)` calls `main()` in-process (no subprocess)
- MSW for API mocking — pre-built handlers per API domain in `src/__tests__/helpers/msw/`
- Shared helpers: `runInTempDir()`, `mockAccountId()`, `mockApiToken()`, `mockConfirm()`, `mockPrompt()`, `mockSelect()`, `captureRequestsFrom()`
- Unit timeout: 15s, retry: 0 (overrides shared config)
- E2E timeout: 90s, bail: 1, singleThread
- `globals: true` for vitest globals
- Output normalization via `normalizeString()` pipeline

## Anti-Patterns

- Never import `expect` from vitest — use test context `({ expect }) => {}`
- Test files use `.test.ts` (not `.spec.ts`)
