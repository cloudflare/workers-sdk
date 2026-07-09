---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Extract remote bindings and the dev proxy worker into standalone packages

The remote bindings driver and dev proxy worker previously lived inside `wrangler` and were re-used by the Vite plugin through a `wrangler` import. This logic now lives in the dedicated `@cloudflare/remote-bindings` and `@cloudflare/dev-proxy` packages, and both `wrangler` and `@cloudflare/vite-plugin` delegate to them. This is an internal restructure with no change to observable behaviour.
