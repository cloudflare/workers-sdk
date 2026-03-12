---
"miniflare": patch
---

Fix local explorer route matching to be more precise

Previously, the route matching used `startsWith("/cdn-cgi/explorer")` which would incorrectly match paths like `/cdn-cgi/explorerfoo` or `/cdn-cgi/explorereeeeee`, causing unexpected behavior. The route matching has been improved to only match:

- `/cdn-cgi/explorer` (exact match)
- `/cdn-cgi/explorer/` and any sub-paths (e.g., `/cdn-cgi/explorer/api/*`)

Paths that merely start with `/cdn-cgi/explorer` but aren't actually the explorer (like `/cdn-cgi/explorerfoo`) will now correctly fall through to the user worker.
