---
"@cloudflare/vite-plugin": patch
---

Expose `/__scheduled` for workers built by `@cloudflare/vite-plugin`

The `/__scheduled` dev-only endpoint that Wrangler exposes via the `--test-scheduled` flag was unavailable when a worker was bundled by `@cloudflare/vite-plugin`, because Wrangler injects the supporting middleware at bundle time and that step does not run under Vite. Requests to `/__scheduled` fell through to the user's router and returned 404.

The vite-plugin now serves `/__scheduled` as an alias for `/cdn-cgi/handler/scheduled` on its dev server, forwarding any `time` and `cron` query parameters to the worker's `scheduled` handler. The existing `/cdn-cgi/handler/scheduled` route continues to work unchanged.
