---
"miniflare": patch
---

Revive gzipped Worker errors from `dispatchFetch` instead of throwing a JSON parse failure

Previously, when a Worker threw an uncaught exception while handling a WebSocket upgrade request, `dispatchFetch` could reject with a confusing JSON parse error instead of the Worker's actual exception. The original error is now reported.
