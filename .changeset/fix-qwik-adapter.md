---
"wrangler": patch
"create-cloudflare": patch
---

Use `qwik add cloudflare-workers` instead of `qwik add cloudflare-pages` for Workers targets

Both the wrangler autoconfig and C3 Workers template for Qwik were running
`qwik add cloudflare-pages` even when targeting Cloudflare Workers. This
caused the wrong adapter directory structure to be scaffolded
(`adapters/cloudflare-pages/` instead of `adapters/cloudflare-workers/`),
and required post-hoc cleanup of Pages-specific files like `_routes.json`.

Qwik now provides a dedicated `cloudflare-workers` adapter that generates
the correct Workers configuration, including `wrangler.jsonc` with `main`
and `assets` fields, a `public/.assetsignore` file, and the correct
`adapters/cloudflare-workers/vite.config.ts`.

Also adds `--skipConfirmation=true` to all `qwik add` invocations so the
interactive prompt is skipped in automated contexts.
