---
"@cloudflare/config": minor
"wrangler": minor
"miniflare": minor
---

Use direct JSRPC types for experimental identity bindings

Select the default or labeled identity with `getIdentity()` before fetching. Represent these identities as RPC stubs with asynchronous metadata getters and normal RPC forwarding and disposal. Accept serializable request bodies on selected fetchers; normalize URL, FormData, and URLSearchParams inputs with `new Request(...)`. AbortSignal options and cross-RPC cancellation guarantees are outside this fetch contract. Local identity issuance remains unavailable and requires no identity compatibility flag.
