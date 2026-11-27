---
"miniflare": patch
---

Decode the body of a rejected WebSocket upgrade in `dispatchFetch()`

When a Worker answered a WebSocket upgrade with a compressed non-101 response, such as a gzipped `401`, `dispatchFetch()` returned the body still compressed but without its `Content-Encoding` header, so the body couldn't be read. The body is now decoded, as it already is for requests without `Upgrade: websocket`, and the original encoding is kept in `MF-Content-Encoding`.
