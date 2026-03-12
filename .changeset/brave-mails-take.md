---
"@cloudflare/local-explorer-ui": patch
---

Fix local explorer's sidebar header link to point to the correct `/cdn-cgi/explorer/` path.

Previously, clicking the link in the header of the sidebar in the local explorer would take you to `/`. This is fine during local Vite development where it knows the correct base URL. But in production, this would result in redirecting to the `/` path of the user worker.
