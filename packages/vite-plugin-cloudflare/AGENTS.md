# AGENTS.md — vite-plugin-cloudflare

## OVERVIEW

Vite plugin for Cloudflare Workers development. Exports `cloudflare()` plugin factory from `src/index.ts`. ESM-only output.

## STRUCTURE

- `src/index.ts` — Plugin factory (uses top-level `await` for `assertWranglerVersion()`)
- `src/workers/` — 4 internal worker entries: `asset-worker`, `router-worker`, `runner-worker`, `vite-proxy-worker`
- `playground/` — ~47 playground apps, each a workspace member (nested workspace under this package)
- `e2e/` — E2E tests with Playwright
- `__tests__/` — Unit tests use `.spec.ts` naming

## BUILD

- Only package using `tsdown` as build tool
- Outputs ESM (`.mjs`) to `dist/index.mjs`
- Also bundles 4 internal worker scripts from `src/workers/*/index.ts` as separate neutral-platform outputs to `dist/workers/`

## CONVENTIONS

- No named imports from `"wrangler"` — must use `import * as wrangler from "wrangler"` (namespace import only, enforced by eslint)
- Uses separate pnpm catalog (`catalogs.vite-plugin`) with different Vite version (7.x) than rest of repo (5.x)
- Top-level `await` in entry — only possible because ESM-only
- Playground directory `worker-♫/` has unicode in name (intentional)

## TESTING

- Unit tests: `.spec.ts` in `__tests__/`
- E2E tests: `.test.ts` in `e2e/`, own vitest config
- Playground tests: Playwright-based, tested across Vite 6/7/8-beta in CI
