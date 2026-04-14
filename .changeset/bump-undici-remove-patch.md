---
"miniflare": patch
"wrangler": patch
---

Fix POST/PUT requests with non-2xx responses throwing "fetch failed"

Previously, sending a POST or PUT request that received a non-2xx response (e.g. 401, 400, 403) would throw a `TypeError: fetch failed` error. This was caused by an undici bug where `isTraversableNavigable()` incorrectly returned `true`, causing the 401 credential-retry block to execute in Node.js and fail on stream-backed request bodies. This has been fixed upstream in undici v7.24.8, so we've bumped our dependency and removed the previous pnpm patch workaround.
