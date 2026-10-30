---
"@cloudflare/pages-functions": patch
"wrangler": patch
---

Fix repeated slashes in URL paths bypassing Pages Functions middleware

Pages Functions now collapse repeated slashes when matching routes, so requests such as `//secure/one` run the same middleware as `/secure/one`. The original request URL is preserved for handlers and asset serving.
