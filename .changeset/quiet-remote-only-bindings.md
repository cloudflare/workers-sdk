---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Defer remote-only binding login until the binding is called

When a project's only remote resources are bindings without a local simulator, such as Workers AI or Vectorize, local development now starts without logging in. The first binding call establishes the remote connection and starts login if needed. Calls wait for login and continue once it succeeds, while unrelated requests keep working. Failed login attempts fail the waiting calls without stopping the development server. Background refresh does not start login for an unused binding.

This applies to Wrangler, the Cloudflare Vite plugin, and the Vitest plugin. Explicitly remote bindings with local simulators, such as KV or D1 with `remote: true`, still require authentication during startup.
