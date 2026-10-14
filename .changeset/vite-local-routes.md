---
"@cloudflare/vite-plugin": major
---

Remove legacy local testing endpoint rewrites

The plugin no longer rewrites legacy local testing endpoints to their canonical `/cdn-cgi/local/*` and `/__cf_local/*` equivalents. Local-development scripts, tests, or integrations that call the legacy endpoints directly must update them as follows:

- `/cdn-cgi/handler/scheduled` and `/cdn-cgi/mf/scheduled` → `/cdn-cgi/local/scheduled`
- `/cdn-cgi/handler/email` → `/cdn-cgi/local/email`
- `/cdn-cgi/mf/stream/*` → `/__cf_local/stream/*`
- `/cdn-cgi/mf/imagedelivery/*` → `/__cf_local/imagedelivery/*`
- `/cdn-cgi/explorer/*` → `/cdn-cgi/local/explorer/*`
