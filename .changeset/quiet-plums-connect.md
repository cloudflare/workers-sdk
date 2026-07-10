---
"@cloudflare/remote-bindings": minor
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Extract remote bindings into a shared package

Wrangler, the Cloudflare Vite plugin, and Vitest Pool now share the same remote-binding session and DevEnv implementation through `@cloudflare/remote-bindings`. This is an internal restructure with no intended change to remote binding behaviour.
