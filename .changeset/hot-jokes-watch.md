---
"@cloudflare/vitest-pool-workers": patch
---

fix: improve `runInDurableObject` type

[#5975](https://github.com/cloudflare/workers-sdk/pull/5975) updated the type for `runInDurableObject` to infer the stub's type correctly for RPC methods, however it used the wrong `DurableObjects` type. This PR fixes the type used to properly support RPC methods.
