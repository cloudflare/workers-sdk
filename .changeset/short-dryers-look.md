---
"@cloudflare/unenv-preset": patch
---

Use native APIs in `node:tls`

Uses `checkServerIdentity`, `createSecureContext`, and `SecureContext` from workerd rather than the unenv polyfill.
