---
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Stop adding `Sec-Fetch-Mode: cors`, `Accept-Language: *` and default `Accept` and `User-Agent` headers to requests forwarded to the Worker

Under `vite dev` and `vite preview`, and through `Miniflare#dispatchFetch()`, a request without these headers reached the Worker with the defaults that Node.js `fetch()` adds. `Miniflare#dispatchFetch()` also replaced a `Sec-Fetch-Mode` sent by the caller with `cors`. The Worker now receives these headers only as the client sent them, as with `wrangler dev`, so checks based on fetch metadata (for example CSRF protection that enforces an origin only when `Sec-Fetch-Mode` is present) behave the same locally as when deployed.
