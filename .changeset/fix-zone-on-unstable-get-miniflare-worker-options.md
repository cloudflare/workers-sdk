---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
---

Fix the outbound `CF-Worker` header falling back to `<worker-name>.example.com` under `vite dev`, `vitest-pool-workers`, and `getPlatformProxy`

When running a Worker via `@cloudflare/vite-plugin`, `@cloudflare/vitest-pool-workers`, or `getPlatformProxy`, outbound subrequests sent the `CF-Worker` header as `<worker-name>.example.com` even when `routes` were configured, breaking local development against services that reject unknown `CF-Worker` hosts (for example, Apple WeatherKit returns `403 Forbidden`). `wrangler dev --local` was not affected.

The root cause was that `unstable_getMiniflareWorkerOptions` (and `getPlatformProxy`) did not propagate a `zone` value onto the worker options they return, so Miniflare fell back to its default. The returned worker options now derive `zone` from the hostname of the first configured `route`. `@cloudflare/vite-plugin` and `@cloudflare/vitest-pool-workers` pick this up automatically with no API changes.

Note: `dev.host` is intentionally not consulted by these code paths — the `dev` config block is specific to `wrangler dev`. If you need a custom `CF-Worker` host under `vite dev`, `vitest-pool-workers`, or `getPlatformProxy`, configure a `route` instead.
