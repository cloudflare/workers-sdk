---
"miniflare": patch
---

Revive gzipped Worker errors from `dispatchFetch` instead of throwing a JSON parse failure

When a Worker throws on a WebSocket upgrade, workerd can return the ERROR_STACK 500 with `Content-Encoding: gzip`. That path used `ws` `unexpected-response` and passed Node's `IncomingMessage` to `Response`, which is not a valid `BodyInit`. undici decoded the gzip as text, then `JSON.parse` saw gzip magic (`1f 8b`) and threw `SyntaxError` instead of the Worker's exception.

The upgrade error body is now buffered as bytes, and `dispatchFetch` inflates gzip (detected by magic bytes, not the `Content-Encoding` header, which undici may leave on an already-decompressed body) before parsing, including nested gzip when workerd wraps a body the Worker already compressed. Empty bodies still fall back to the payload header, as for `HEAD`.
