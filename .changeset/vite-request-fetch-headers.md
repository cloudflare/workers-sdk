---
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Stop adding `Sec-Fetch-Mode` and `Accept-Language` to requests forwarded to the Worker in `vite dev` and `vite preview`

A request without these headers, such as one from curl or a server-to-server call, reached the Worker with `sec-fetch-mode: cors` and `accept-language: *`, because the plugin forwards requests with undici's `fetch()`, which adds them. The Worker now receives them only when the client sent them, as in `wrangler dev`.
