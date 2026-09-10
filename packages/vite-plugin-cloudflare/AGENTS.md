# AGENTS.md — vite-plugin-cloudflare

## OVERVIEW

Vite plugin for Cloudflare Workers development. Exports `cloudflare()` plugin factory from `src/index.ts`. ESM-only output.

## STRUCTURE

- `src/index.ts` — Plugin factory (uses top-level `await` for `assertWranglerVersion()`)
- `src/cf-vite.ts` — `cf-vite` delegate binary entry (see below)
- `bin/cf-vite` — shebang shim that dynamic-imports `dist/cf-vite.mjs`
- `src/workers/` — 4 internal worker entries: `asset-worker`, `router-worker`, `runner-worker`, `vite-proxy-worker`
- `playground/` — ~47 playground apps, each a workspace member (nested workspace under this package)
- `e2e/` — E2E tests with Playwright
- `__tests__/` — Unit tests use `.spec.ts` naming

## BUILD

- Only package using `tsdown` as build tool
- Outputs ESM (`.mjs`) to `dist/index.mjs`
- `src/cf-vite.ts` is a second top-level tsdown entry, bundled to `dist/cf-vite.mjs` (no dts)
- Also bundles 4 internal worker scripts from `src/workers/*/index.ts` as separate neutral-platform outputs to `dist/workers/`

## cf-vite DELEGATE BINARY (experimental / internal)

`bin/cf-vite` is an experimental, internal delegate binary spawned by
Cloudflare's "cf-dev" parent process — NOT part of the plugin's public
API and not meant for direct end-user invocation. It is the sibling of
`wrangler`'s `cf-wrangler` binary, and the two MUST keep a shared spawn
contract so the parent can drive either impl interchangeably.

- **Verb dispatch.** `cf-vite <verb> [flags]`. `dev` and `build` are the
  verbs today; future verbs (`deploy`) follow the same shape.
  Unknown/missing verbs exit `2` (this doubles as the parent's
  version-detection signal — no JSON handshake).
- **Shared flag vocabulary (`dev`).** For `dev`, only `--mode`, `--port`,
  `--host`, `--local` are accepted, mirroring `cf-wrangler` exactly.
  Parsed with `node:util.parseArgs` strict mode → unknown flags exit `2`.
  Do NOT add flags here unless `cf-wrangler` grows them too. (There is no
  `--config` flag: the wrangler config is discovered by `cloudflare()`
  itself.)
- **`build`** `cf-vite build` runs Vite's full multi-environment
  app build via `createBuilder().buildApp()` (NOT the legacy
  single-environment `build()` helper, which would skip the plugin's
  worker/build-output orchestration — mirrors Vite's own `vite build`
  CLI). It accepts **only `--mode`** (`--port`/`--host`/`--local` don't
  apply to a build and exit `2`).
- **Build Output Specification forced for every verb.** `main()` sets
  `CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT` unconditionally (before Vite
  loads the user's config), enabling `experimental.newConfig` +
  `experimental.newConfig.cfBuildOutput` (overriding plugin config),
  which requires a `cloudflare.config.ts` at the project root. The env
  var name and read logic live in `build-output-env.ts`
  (`FORCE_BUILD_OUTPUT_ENV_VAR` / `isForcedBuildOutput()`), shared by the
  two read sites that MUST agree: `index.ts` (selects the build-output
  plugin at construction) and `resolvePluginConfig`. Both read directly
  from `process.env` (NOT Vite's `loadEnv`), since `index.ts` runs before
  Vite resolves a root/mode and this is an internal bridge, not a
  `.env`-file knob.
- **`dev`** `cf-vite dev` boots Vite via `createServer()`
  against the user's own `vite.config.ts` (which must include
  `cloudflare()`). Plugin-owned flags are bridged via env vars the plugin
  already reads (`--local` → `CLOUDFLARE_VITE_FORCE_LOCAL`); Vite-owned
  flags go through inline config (`--port`/`--host` → `server.*`,
  `--mode` → `mode`).
- **`--local`** forces remote bindings off. There is no plugin env knob
  for `remoteBindings` other than `CLOUDFLARE_VITE_FORCE_LOCAL`, which
  `resolvePluginConfig` in `plugin-config.ts` honours by overriding the
  `remoteBindings` config option. Keep that override in sync if the flag
  semantics change.
- **Hotkeys differ by design.** `cf-vite` uses Vite's own
  `bindCLIShortcuts` (`h`/`r`/`q`/…), not wrangler's hotkey set. The
  parent process should not assume identical hotkey UX across delegates.
- **Exit codes.** `0` graceful, `2` unknown verb / argv parse error,
  `130` SIGINT, `143` SIGTERM.

## CONVENTIONS

- No named imports from `"wrangler"` — must use `import * as wrangler from "wrangler"` (namespace import only, enforced by eslint)
- Top-level `await` in entry — only possible because ESM-only
- Playground directory `worker-♫/` has unicode in name (intentional)

## TESTING

- Unit tests: `.spec.ts` in `__tests__/`
- E2E tests: `.test.ts` in `e2e/`, own vitest config
- Playground tests: Playwright-based, tested across Vite 7/8 in CI
- Playground request helpers (`playground/__test-utils__/responses.ts`):
  - `getTextResponse()` / `getJsonResponse()` issue a request with browser
    navigation headers (`Sec-Fetch-Mode: navigate` et al), which the asset and
    router workers branch on. Default to these.
  - They use undici's low-level `request()` rather than `fetch()`
    **deliberately**. The Fetch spec requires implementations to set
    `Sec-Fetch-Mode` from the request's `mode` ("append the Fetch metadata
    headers"), so `fetch()` overwrites whatever the caller passed with `cors`
    before the request leaves the process (`appendFetchMetadata` in undici).
    `Sec-Fetch-Dest`/`-Site`/`-User` are unimplemented there, so they survive —
    which is why only `Sec-Fetch-Mode` breaks and it is easy to miss. That one
    decides whether the asset worker applies `not_found_handling`.
  - This is permanent, not a bug to wait out: no Fetch-based API can send
    `Sec-Fetch-Mode: navigate`, and `fetch(url, { mode: "navigate" })` is
    rejected by the `Request` constructor. Do not "simplify" these back to
    `fetch()`; `spa-with-api`'s "via `getTextResponse()`" test exists to catch
    exactly that regression (it is the only playground whose compat date enables
    `SEC_FETCH_MODE_NAVIGATE_HEADER_PREFERS_ASSET_SERVING`).
  - `getResponse()` drives a real `page.goto()` and returns a Playwright
    `Response`. Only use it when the assertion needs the browser. Anything
    routed through Playwright can outlive a timed-out test and surface as an
    unhandled rejection, which fails the whole run rather than one test.
  - `WAIT_FOR_OPTIONS` (`playground/__test-utils__/index.ts`) must stay
    comfortably below the test timeout, otherwise `vi.waitFor()` never gets to
    report the assertion that was actually failing.
- `playground/vitest.config.e2e.ts` inherits the repo-wide timeouts and
  `retry: 1` from the root `vitest.shared.ts`. It spreads `configShared.test`
  rather than using `mergeConfig()`, which concatenates arrays and would
  silently enable the shared `default` reporter alongside `dot`.
