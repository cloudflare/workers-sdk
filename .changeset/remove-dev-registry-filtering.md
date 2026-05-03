---
"wrangler": patch
---

Fix `props` and fetcher-type service bindings being dropped in `unstable_getMiniflareWorkerOptions`

The post-processing in `unstable_getMiniflareWorkerOptions` was rebuilding `serviceBindings` from scratch, which silently dropped `props` on service bindings and dropped `fetcher`-type bindings entirely. It was also re-deriving `durableObjects` identically to what `buildMiniflareBindingOptions` already produces. Both have been removed; `buildMiniflareBindingOptions` now produces the final bindings unchanged.
