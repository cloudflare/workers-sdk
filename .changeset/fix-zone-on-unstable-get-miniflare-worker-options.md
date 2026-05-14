---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
---

Fix the outbound `CF-Worker` header falling back to `<worker-name>.example.com` under `vite dev` and `vitest-pool-workers`

When running a Worker via `@cloudflare/vite-plugin` or `@cloudflare/vitest-pool-workers`, outbound subrequests sent the `CF-Worker` header as `<worker-name>.example.com` even when `dev.host` or `routes` were configured, breaking local development against services that reject unknown `CF-Worker` hosts (for example, Apple WeatherKit returns `403 Forbidden`). `wrangler dev --local` was not affected.

The root cause was that `unstable_getMiniflareWorkerOptions` (and `getPlatformProxy`) did not propagate a `zone` value onto the worker options they return, so Miniflare fell back to its default. The returned `workerOptions` now derives `zone` from the config the same way `wrangler dev` does: it prefers `dev.host`, and otherwise falls back to the hostname of the first configured route. `@cloudflare/vite-plugin` and `@cloudflare/vitest-pool-workers` pick this up automatically with no API changes.
