---
"miniflare": patch
---

Fix Durable Object `stub.fetch` rejecting Node's global `Request`

Passing a Node.js global `Request` object to a Durable Object stub's `fetch()` (for example when using `getPlatformProxy`) previously failed with a URL parsing error. Such requests are now accepted and forwarded as expected.
