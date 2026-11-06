# AGENTS.md — vite-plugin-cloudflare

## OVERVIEW

Vite plugin for Cloudflare Workers development. Exports `cloudflare()` plugin factory from `src/index.ts`. ESM-only output.

## STRUCTURE

- `src/index.ts` — Plugin factory
- `src/workers/` — 4 internal worker entries: `asset-worker`, `router-worker`, `runner-worker`, `vite-proxy-worker`
- `playground/` — ~47 playground apps, each a workspace member (nested workspace under this package)
- `e2e/` — E2E tests with Playwright
- `__tests__/` — Unit tests use `.spec.ts` naming

## BUILD

- Only package using `tsdown` as build tool
- Outputs ESM (`.mjs`) to `dist/index.mjs`
- Also bundles 4 internal worker scripts from `src/workers/*/index.ts` as separate neutral-platform outputs to `dist/workers/`
- Release builds set `SOURCEMAPS=false` to omit the plugin's JavaScript and declaration maps. Normal builds retain maps for debugging; the setting does not change source maps for applications built with the plugin.

## CLOUDFLARE TOOLING

- Run development and builds through Vite's CLI or the framework's own commands.
- Every build emits Build Output; Preview reads Workers and Containers from that output.
- Preview build context is supplied through `CLOUDFLARE_PREVIEW_BUILD`, including when a framework runs Vite as part of its build command.
- Configure `cloudflare({ remoteBindings: false })` to disable remote bindings.
- Authentication profiles resolve through `@cloudflare/workers-auth`, including `CLOUDFLARE_AUTH_PROFILE` inherited from the parent. Remote-binding credentials are keyed by the resolved profile as well as project directory and account, so a profile change on restart replaces the session's authentication.

## CONVENTIONS

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
