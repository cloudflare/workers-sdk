---
"@cloudflare/pages-functions": patch
"wrangler": patch
---

Fix repeated slashes in URL paths bypassing Pages Functions middleware

Pages Functions now collapse repeated slashes when looking up middleware, so requests such as `//secure/one` run the same middleware as `/secure/one`. The original request URL and function-route matching are preserved. Middleware receives a `functionPath` prefix from the original URL so imported assets can still resolve their relative paths.
