---
"@cloudflare/vite-plugin": major
---

Remove legacy local testing endpoint rewrites

The plugin now uses the canonical `/cdn-cgi/local/*` and `/__cf_local/*` endpoints directly. It no longer rewrites the legacy `/cdn-cgi/handler`, `/cdn-cgi/mf/scheduled`, `/cdn-cgi/mf/stream`, `/cdn-cgi/mf/imagedelivery`, or `/cdn-cgi/explorer` paths.
