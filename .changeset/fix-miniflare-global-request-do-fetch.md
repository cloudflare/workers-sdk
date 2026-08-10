---
"miniflare": patch
---

Fix Durable Object `stub.fetch` rejecting Node global `Request` objects

Passing a Node.js global `Request` to `DurableObjectStub#fetch` (for example via `getPlatformProxy`) failed because undici's brand check did not recognise the global `Request`, stringified it to `[object Request]`, and then threw while parsing that as a URL. Miniflare's `Request` constructor now converts foreign/global Request-like values before calling undici.
