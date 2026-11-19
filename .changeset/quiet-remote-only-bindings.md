---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-auth": patch
---

Allow local development with unauthenticated remote-only bindings

When a project's only remote resources are bindings without a local simulator, such as Workers AI or Vectorize, missing or expired credentials no longer force a login or prevent the local Worker from starting. These bindings throw when called, and other parts of the Worker remain available. Existing credentials are still used and refreshed when possible; sign in and restart development to enable the unavailable bindings.

This applies to Wrangler, the Cloudflare Vite plugin, and the Vitest plugin. Explicitly remote bindings with local simulators, such as KV or D1 with `remote: true`, still require authentication during startup.
