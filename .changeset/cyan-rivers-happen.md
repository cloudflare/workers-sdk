---
"@cloudflare/vite-plugin": patch
---

Allow internal Wrangler config path overrides via env

`@cloudflare/vite-plugin` now checks `CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH` when `configPath` is not set explicitly. This lets integrators provide generated Wrangler configs outside the project root without requiring users to thread `configPath` through framework config.
