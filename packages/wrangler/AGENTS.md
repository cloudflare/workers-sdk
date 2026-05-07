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
- `telemetryMessage` values for `UserError`-compatible errors must be static, safe labels. Do not use `telemetryMessage: true` unless the user-facing message cannot include user input, file paths, resource names, IDs, secret names, raw API messages, or command input. Even when safe, `telemetryMessage: true` is usually less useful because user-facing copy is harder to group and parse than a stable telemetry label.
- Format `telemetryMessage` values as lower-case phrases: `<service or area> <command or sub-area> <failure>`, for example `kv namespace binding not found in config`, `r2 object put file not found`, or `pages deploy project name missing`.
- Keep the service/area first and the failure last so telemetry groups consistently. Prefer stable categories over user-facing copy; telemetry labels should not change just because CLI wording changes.

## Build

- tsup: single entry `src/cli.ts` → `wrangler-dist/cli.js`
- `package.json` `main` points at `wrangler-dist/cli.js`
- Custom `embedWorkersPlugin()` bundles Worker templates via esbuild for tests

## Testing

- Pool: `"forks"` (not threads) — heavy global mocking
- `runWrangler(cmd)` calls `main()` in-process (no subprocess)
- MSW for API mocking — pre-built handlers per API domain in `src/__tests__/helpers/msw/`
- Shared helpers: `runInTempDir()`, `mockAccountId()`, `mockApiToken()`, `mockConfirm()`, `mockPrompt()`, `mockSelect()`, `captureRequestsFrom()`
- Unit timeout: 50s, retry: 0. Note: wrangler's `vitest.config.mts` does NOT use `mergeConfig` with `vitest.shared.ts`, so shared defaults (timeouts, retry, etc.) are not inherited — they must be set explicitly in the wrangler config.
- E2E timeout: 90s, bail: 1, singleThread
- `globals: true` for vitest globals
- Output normalization via `normalizeString()` pipeline

## Anti-Patterns

- Test files use `.test.ts` (not `.spec.ts`)
- Never import `expect` from vitest — use test context `({ expect }) => {}`
  - When adding `expect` as a parameter to helper functions, check ALL call sites (e.g., across `deployments.test.ts`, `versions.test.ts`)
