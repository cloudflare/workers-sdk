---
"miniflare": patch
---

Preserve multiple `Set-Cookie` headers on WebSocket 101 upgrade responses

Iterating a `Headers` object with `for…of` collapses all `Set-Cookie` values into a single comma-joined string — a known web-platform limitation. This corrupted cookies whose attributes contain commas (e.g. `Expires=Wed, 09 Jun 2026 …`), causing clients to receive a single mangled `Set-Cookie` line instead of separate cookies when a Worker's WebSocket response included more than one.

Fixes [#14145](https://github.com/cloudflare/workers-sdk/issues/14145).
