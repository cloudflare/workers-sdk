---
"@cloudflare/vitest-pool-workers": patch
---

Fix Durable Object RPC dispatch for constructors that return proxies

Durable Object RPC methods mediated by a returned `Proxy` are now resolved through that proxy after validating prototype exposure. This allows wrappers that bind methods to the underlying instance to use private fields and methods in Vitest, while matching workerd's rejection of constructor-assigned RPC overrides.
