---
"miniflare": patch
---

Keep `Content-Encoding` on `dispatchFetch()` responses whose body Miniflare can't decode

`Miniflare#dispatchFetch()` decodes compressed response bodies and moves their `Content-Encoding` header to `MF-Content-Encoding`. It did this for every response, so a body in an encoding it can't decode, such as `zstd` on Node.js versions before 22.15, came back still compressed but with no `Content-Encoding` header. Such responses now keep their `Content-Encoding` header, so callers like the Vite plugin pass them on intact.
