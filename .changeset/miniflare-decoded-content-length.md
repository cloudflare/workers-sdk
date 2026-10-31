---
"miniflare": patch
---

Fix `Miniflare#dispatchFetch()` returning a compressed `Content-Length` with a decoded body

`dispatchFetch()` decodes compressed response bodies and removes `Content-Encoding`, but it kept the `Content-Length` of the compressed body. Callers that forward the response, such as the Vite plugin under `vite dev`, sent a truncated body. `Content-Length` is now removed together with `Content-Encoding`.
