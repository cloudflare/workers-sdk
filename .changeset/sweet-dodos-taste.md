---
"miniflare": patch
---

Preserve streaming responses by avoiding implicit compression in local development

Miniflare now keeps a Worker's response encoding when the client accepts it, and otherwise prefers an uncompressed response when identity encoding is allowed. This prevents automatic gzip or Brotli compression from buffering small streamed chunks. Clients that explicitly reject identity still receive a supported compression encoding or a 415 response.

This shared behavior applies to local HTTP responses served through Miniflare, Wrangler, and the Vite plugin. Vitest service-binding calls continue to use workerd's existing response handling. Miniflare's `dispatchFetch()` also removes stale transfer and content length headers from its decoded responses.
