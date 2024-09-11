---
"@cloudflare/vitest-pool-workers": patch
---

fix: The `workerd` provided `node:url` module doesn't support everything Vitest needs. As a short-term fix, inject the `node:url` polyfill into the worker bundle.
