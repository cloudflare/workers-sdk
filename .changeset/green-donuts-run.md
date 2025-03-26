---
"wrangler": patch
---

Bump `@cloudflare/unenv-preset` to 2.3.1

Use the workerd native implementation of `createSecureContext` and `checkServerIdentity` from `node:tls`. The functions have been implemented in `cloudflare/workerd#3754`.
