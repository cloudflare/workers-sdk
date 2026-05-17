---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
---

Fix the outbound `CF-Worker` header reflecting the route pattern hostname instead of the parent zone, and falling back to `<worker-name>.example.com` under `vite dev`, `vitest-pool-workers`, and `getPlatformProxy`

The `CF-Worker` header on outbound subrequests had two related issues in local development:

1. Under `@cloudflare/vite-plugin`, `@cloudflare/vitest-pool-workers`, and `getPlatformProxy`, the header fell back to `<worker-name>.example.com` even when `routes` were configured, because `unstable_getMiniflareWorkerOptions` and the equivalent `getPlatformProxy` worker-options path did not propagate a `zone` value to Miniflare. This broke local development against services that reject unknown `CF-Worker` hosts (for example, Apple WeatherKit returns `403 Forbidden`).
2. Across all three of these paths and `wrangler dev --local`, when a route used the `zone_name` field (for example `{ pattern: "foo.example.com/*", zone_name: "example.com" }`), the header was set to the pattern's hostname (`foo.example.com`) rather than the zone name (`example.com`). Production [sets `CF-Worker` to the zone name that owns the Worker](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker), so this was inconsistent with deployed behaviour.

Zone derivation now lives in a shared `getZoneFromRoute` helper that prefers the route's explicit `zone_name` when present and falls back to the pattern's hostname otherwise — a best-effort approximation when only `zone_id`, a string pattern, or a `custom_domain` route is configured, since resolving the parent zone locally would require an API lookup. Both `wrangler dev --local` and the `unstable_getMiniflareWorkerOptions` / `getPlatformProxy` code paths use this helper, so the three local-dev paths now agree with each other and with production for `zone_name` routes.

Note: `dev.host` is intentionally not consulted by the `unstable_getMiniflareWorkerOptions` / `getPlatformProxy` paths — the `dev` config block is specific to `wrangler dev`.
