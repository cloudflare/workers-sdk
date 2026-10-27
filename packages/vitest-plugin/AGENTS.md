# vitest-plugin — Agent Guide

> Custom Vitest pool for running Worker tests inside the actual workerd runtime.
> Do NOT repeat root AGENTS.md content (pnpm, changesets, code style, etc.).

## THREE-CONTEXT ARCHITECTURE

### 1. Pool (`src/pool/index.ts`)

- Runs in Node.js Vitest process
- Main export (`exports["."]`), built as ESM (`.mjs`)
- Orchestrates test execution

### 2. Config (`src/pool/config.ts`)

- Runs in Node.js, part of the pool bundle (no separate package export)
- Validates pool options (`WorkersPoolOptionsSchema`) and resolves the project's
  Worker configuration into Miniflare options
- `src/pool/plugin.ts` provides the `cloudflareTest()` Vite plugin, which injects
  `cloudflare:test` resolution and sets resolve conditions (`workerd`, `worker`, `browser`)

### 3. Worker (`src/worker/index.ts`)

- Runs inside workerd runtime
- NOT exported via package.json — internal entry
- Contains HACK: monkeypatches VitestExecutor to access singleton
- Has direct cross-package source import into `miniflare/src/workers/core/devalue`

## WORKER CONFIGURATION SOURCES

`parseCustomPoolOptions()` in `src/pool/config.ts` resolves at most one configuration
file:

- `wrangler: { configPath, environment }` — a Wrangler configuration file, via
  `wrangler.unstable_readConfig()`, then `unstable_getMiniflareWorkerOptions()` (remote
  proxy session, `main`, defines, module rules, tails) merged into the V4 `miniflare`
  options
- `config: true | "<path>"` — a `cloudflare.config.ts`, via `src/pool/new-config.ts`
  (`@cloudflare/config`'s `loadAndParseConfig()`), never through Wrangler. `miniflare`
  options are merged over the config's Worker. Secrets and Hyperdrive values are resolved
  with Miniflare's `resolveLocalBindings()`, and remote bindings use cf
  credentials (`src/pool/auth.ts`) through `@cloudflare/remote-bindings`, which accepts
  the config's bindings as they are. `ctx.mode` comes from `project.vite.config.mode`.

The two are mutually exclusive. Whichever is used, the resolved path, config format,
top-level Worker name and effective environment Worker name are recorded on
`options.resolvedConfig` for the pool to consume — never re-read the config file from
disk. Durable Object and Workflow self-references use the effective name so bindings
to a base Worker remain external when testing a named environment.

Parsing then resolves the Worker under test and the auxiliary Workers once, into
Miniflare's native `WorkerOptions` shape, on `options.projectWorkers`
(`resolveProjectWorkers()`). `wrangler`/`miniflare` options go through
`convertV4MiniflareOptions()`. With `config`, `mergeCloudflareConfigWorker()` in
`src/pool/new-config.ts` merges them over the config's Worker, which is used as it is.
The Worker takes the runner's name, and references to its configured name are pointed at
the runner. `buildProjectWorkerOptions()` in `src/pool/index.ts` adds the pool's modules
and internal bindings to it, and the Durable Object designators are read from it.

## BUILD

`tsdown.config.ts` defines 2 separate builds (all ESM):

1. pool — `src/pool/index.ts` → `dist/pool` (emits type declarations)
2. worker + libs — `src/worker/index.ts` plus `src/worker/lib` and `src/worker/node` → `dist/worker`

Types entry `types/cloudflare-test.d.ts` is hand-written (NOT generated from source).

## THE `cloudflare:test` MODULE

Tests inside workerd import from `cloudflare:test`:

```ts
import { env, fetchMock, SELF } from "cloudflare:test";
```

Resolved by custom Vite plugin (`@cloudflare/vitest-plugin:config`) that re-exports from `cloudflare:test-internal` (runtime-provided).

## CONVENTIONS

- `expect` must come from test context: `it("name", ({ expect }) => {})` — never `import { expect } from "vitest"`
- Tests use `.test.ts` naming
- Excludes `*.worker.test.ts` from vitest config

## TESTING

- Does NOT extend `vitest.shared.ts`
- Hook timeout: 60s, retry: 2
- Global setup starts mock npm registry, installs local package to temp dir
- Test helper: custom `test` fixture with `tmpPath`, `seed()`, `vitestRun()`, `vitestDev()`
- Fixtures in `fixtures/vitest-plugin-examples/` (20+ sub-fixtures testing KV, R2, D1, DO, Queues, `cloudflare.config.ts`, etc.)
- Skipped on Windows CI due to flakiness
