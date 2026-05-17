---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
---

Fix the outbound `CF-Worker` header reflecting the route pattern hostname instead of the parent zone, and falling back to `<worker-name>.example.com` under `vite dev`, `vitest-pool-workers`, and `getPlatformProxy`

Two related issues affected the `CF-Worker` header on outbound subrequests in local development:

1. Under `@cloudflare/vite-plugin`, `@cloudflare/vitest-pool-workers`, and `getPlatformProxy`, the header fell back to `<worker-name>.example.com` even when `routes` were configured, because `unstable_getMiniflareWorkerOptions` and the equivalent `getPlatformProxy` worker-options path did not propagate a `zone` value to Miniflare. This broke local development against services that reject unknown `CF-Worker` hosts (for example, Apple WeatherKit returns `403 Forbidden`).
2. Across the above paths and `wrangler dev --local`, when a route used the `zone_name` field (for example `{ pattern: "foo.example.com/*", zone_name: "example.com" }`), the header was set to the pattern's hostname (`foo.example.com`) rather than the zone name (`example.com`). Production [sets `CF-Worker` to the zone name that owns the Worker](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker), so this was inconsistent with deployed behaviour.

Both bugs are fixed: the new `unstable_getMiniflareWorkerOptions` / `getPlatformProxy` path now propagates a `zone` derived from the first configured route, and all four local-dev paths now prefer a route's explicit `zone_name` over the pattern hostname when computing that zone. When `zone_name` isn't set, the existing best-effort behaviour is preserved — for `wrangler dev` this means `dev.host` is still honoured as a local override and the pattern hostname is used as a final fallback. Resolving the parent zone for `zone_id`-only, `custom_domain`, or plain-string routes would require an API lookup, so locally we still approximate it with the pattern hostname.

Note: `dev.host` is intentionally not consulted by the `unstable_getMiniflareWorkerOptions` / `getPlatformProxy` paths — the `dev` config block is specific to `wrangler dev`.
