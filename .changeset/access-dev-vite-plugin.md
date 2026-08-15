---
"wrangler": patch
---

Simulate `ctx.access` under `@cloudflare/vite-plugin` when `access.dev` is configured

The `access.dev` config (added in wrangler 4.123.0) simulates a Cloudflare Access identity locally, but it was only wired into the `wrangler dev` path. When the dev server ran through `@cloudflare/vite-plugin`, `ctx.access` resolved to `undefined` with no warning, even though the docs list the Vite plugin as supported.

The shared config translation used by the Vite plugin (`unstable_getMiniflareWorkerOptions`) now passes `access.dev` through to the Miniflare worker options, the same way `wrangler dev` already does, so `ctx.access.getIdentity()` returns the configured identity in both dev paths.
