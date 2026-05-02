---
"wrangler": patch
---

Remove redundant dev-registry filtering in `unstable_getMiniflareWorkerOptions`

The code that rewrote `serviceBindings` and `durableObjects` in `unstable_getMiniflareWorkerOptions` was originally needed to avoid relying on the dev registry for the Workers Vitest pool. Since the dev registry is now entirely defined in Miniflare, this rewriting is no longer necessary — `buildMiniflareBindingOptions` already produces the correct bindings. Removing this code also means `props` on service bindings are no longer dropped.
