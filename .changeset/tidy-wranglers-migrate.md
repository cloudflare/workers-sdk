---
"@cloudflare/vite-plugin": patch
---

Prevent legacy Wrangler configuration files from being silently ignored

The Vite plugin now stops with an actionable error when `wrangler.json`, `wrangler.jsonc`, or `wrangler.toml` is present without `cloudflare.config.ts`. Run `npx cf migrate --bundler vite` to migrate the project before building.
