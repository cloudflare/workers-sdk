---
"miniflare": major
---

Remap local testing paths to avoid collision with production `/cdn-cgi` routes

All miniflare-internal endpoints have moved to more consistent paths. Paths that need to remain reachable over tunnels now live outside `/cdn-cgi/`:

- `/cdn-cgi/platform-proxy` → `/cdn-cgi/local/platform-proxy`
- `/cdn-cgi/handler/scheduled` → `/cdn-cgi/local/scheduled`
- `/cdn-cgi/handler/email` → `/cdn-cgi/local/email`
- `/cdn-cgi/explorer/*` → `/cdn-cgi/local/explorer/*`
- `/cdn-cgi/mf/scheduled` → removed (was already deprecated)
- `/cdn-cgi/mf/stream/*` → `/__cf_local/stream/*`
- `/cdn-cgi/mf/imagedelivery/*` → `/__cf_local/imagedelivery/*`

Wrangler and the Vite plugin will add transparent path rewrites so the old paths continue to work for users of those tools.
