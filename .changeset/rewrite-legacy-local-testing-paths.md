---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Rewrite local testing paths (`/cdn-cgi/*`)

Miniflare v5 moved its internal local testing endpoints to `/cdn-cgi/local/*` (and `/__cf_local/*` for endpoints that must remain reachable over tunnels) to prevent any potential collision with production routes. `wrangler dev` and the Vite plugin now transparently rewrite the old paths to the new ones, meaning you can continue to use the old paths without issue.

These are the new paths:

- `/cdn-cgi/handler/scheduled` → `/cdn-cgi/local/scheduled`
- `/cdn-cgi/handler/email` → `/cdn-cgi/local/email`
- `/cdn-cgi/explorer/*` → `/cdn-cgi/local/explorer/*`
- `/cdn-cgi/mf/scheduled` → `/cdn-cgi/local/scheduled` (Note `/cdn-cgi/mf/scheduled` is already deprecated)
- `/cdn-cgi/mf/stream/*` → `/__cf_local/stream/*`
- `/cdn-cgi/mf/imagedelivery/*` → `/__cf_local/imagedelivery/*`
- `/cdn-cgi/platform-proxy` → `/cdn-cgi/local/platform-proxy`
