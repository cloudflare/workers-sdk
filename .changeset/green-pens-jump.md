---
"wrangler": patch
---

Extract remote bindings session setup into `@cloudflare/remote-bindings`

Wrangler's remote bindings preview session logic now delegates to the new `@cloudflare/remote-bindings` package, replacing the full DevEnv pipeline with direct API calls and a minimal Node.js HTTP proxy. The existing `startRemoteProxySession()` programmatic API behavior is preserved via a compatibility wrapper.
