---
"@cloudflare/remote-bindings": minor
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Extract remote bindings into a shared package

Wrangler, the Cloudflare Vite plugin, and Vitest Pool now share the same remote-binding proxy session through `@cloudflare/remote-bindings`. This is an internal restructure with no intended change to remote binding behaviour.
