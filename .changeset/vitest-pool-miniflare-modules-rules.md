---
"@cloudflare/vitest-pool-workers": minor
---

Update the Workers Vitest pool for Miniflare's config-based options

The Workers Vitest pool now converts the Miniflare options it creates for test sessions to Miniflare's config-based `workers` shape.

For the most part, users should not expect to notice any changes.

However, while `miniflare.modulesRules` is preserved for common text and WASM fixture imports, it is not a full replacement for Miniflare's old `modules: true` module graph collection and you may notice some differences in behaviour.
