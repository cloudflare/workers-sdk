---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Defer remote binding login until a binding is called

Except for remote Hyperdrive, remote bindings no longer require login at local development startup. This includes bindings that always run remotely, such as Workers AI and Vectorize, and bindings configured with `remote: true`, such as KV and D1. The first remote binding call establishes the connection and starts login if needed. Calls wait for login and continue once it succeeds, while unrelated requests keep working. Failed login attempts fail the waiting calls without stopping the development server. Background refresh does not start login for an unused binding.

This applies to Wrangler, the Cloudflare Vite plugin, and the Vitest plugin.

Remote Hyperdrive's first binding call happens during startup: Miniflare requests database credentials to set up the local bridge. A definitive account or authentication rejection fails startup with the original diagnostic. Transient connection failures are retried and do not prevent other bindings from working.
