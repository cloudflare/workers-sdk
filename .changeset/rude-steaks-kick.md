---
"miniflare": patch
---

Fix local explorer route matching to handle `/cdn-cgi/explorer` without trailing slash

Previously, visiting `/cdn-cgi/explorer` would show a warning about the server being configured with a public base URL of `/cdn-cgi/explorer/`. Now, requests to `/cdn-cgi/explorer` are automatically redirected to `/cdn-cgi/explorer/`, eliminating the confusing warning message.
