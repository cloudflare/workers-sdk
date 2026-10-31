---
"@cloudflare/config": minor
"wrangler": minor
---

Generate the complete experimental identity binding API

Expose `getIdentity(label?)`, asynchronous readonly metadata, and the fixed-selection fetcher in inferred and generated binding types. Preserve normal typed RPC forwarding for minted fetchers, including signing-only bindings without a token audience.
