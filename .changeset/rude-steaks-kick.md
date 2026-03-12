---
"miniflare": patch
---

Fix local explorer route matching to handle `/cdn-cgi/explorer` without trailing slash

Previously, visiting `/cdn-cgi/explorer` would show a warning about the server being configured with a public base URL of `/cdn-cgi/explorer/`. The route matching has been improved to correctly serve the explorer UI at both `/cdn-cgi/explorer` and `/cdn-cgi/explorer/`.
