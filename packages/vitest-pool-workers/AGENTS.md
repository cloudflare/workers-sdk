# vitest-pool-workers — Agent Guide

> Custom Vitest pool for running Worker tests inside the actual workerd runtime.
> Do NOT repeat root AGENTS.md content (pnpm, changesets, code style, etc.).

## THREE-CONTEXT ARCHITECTURE

### 1. Pool (`src/pool/index.ts`)

- Runs in Node.js Vitest process
- Main export (`exports["."]`), built as ESM (`.mjs`)
- Orchestrates test execution

### 2. Config (`src/config/index.ts`)

- Runs in Node.js
- Exported as `exports["./config"]`, built as CJS (`.cjs`)
- Provides `defineWorkersConfig()` / `defineWorkersProject()` helpers
- Injects Vite plugin for `cloudflare:test` resolution, sets resolve conditions (`workerd`, `worker`, `browser`)

### 3. Worker (`src/worker/index.ts`)

- Runs inside workerd runtime
- NOT exported via package.json — internal entry
- Contains HACK: monkeypatches VitestExecutor to access singleton
- Has direct cross-package source import into `miniflare/src/workers/core/devalue`

## BUILD

`scripts/bundle.mjs` runs 3 separate esbuild builds:

1. `undici` mock-agent (CJS)
2. pool + worker (ESM)
3. config + libs (CJS)

Types entry `types/cloudflare-test.d.ts` is hand-written (NOT generated from source).

## THE `cloudflare:test` MODULE

Tests inside workerd import from `cloudflare:test`:

```ts
import { env, fetchMock, SELF } from "cloudflare:test";
```

Resolved by custom Vite plugin (`@cloudflare/vitest-pool-workers:config`) that re-exports from `cloudflare:test-internal` (runtime-provided).

## CONVENTIONS

- `expect` must come from test context: `it("name", ({ expect }) => {})` — never `import { expect } from "vitest"`
- Tests use `.test.ts` naming
- Excludes `*.worker.test.ts` from vitest config

## TESTING

- Does NOT extend `vitest.shared.ts`
- Hook timeout: 60s, retry: 2
- Global setup starts mock npm registry, installs local package to temp dir
- Test helper: custom `test` fixture with `tmpPath`, `seed()`, `vitestRun()`, `vitestDev()`
- Fixtures in `fixtures/vitest-pool-workers-examples/` (20+ sub-fixtures testing KV, R2, D1, DO, Queues, etc.)
- Skipped on Windows CI due to flakiness
