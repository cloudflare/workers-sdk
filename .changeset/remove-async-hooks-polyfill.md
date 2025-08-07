---
"@cloudflare/unenv-preset": minor
"wrangler": patch
---

Remove async_hooks polyfill - now uses native workerd implementation

The async_hooks module is now provided natively by workerd, making the polyfill unnecessary. This improves performance and ensures better compatibility with Node.js async_hooks APIs.
