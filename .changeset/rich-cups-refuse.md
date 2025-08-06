---
"miniflare": minor
"wrangler": minor
"miniflare-shared": patch
---

- Add support for dynamically loading 'external' Miniflare plugins for unsafe Worker bindings (developed outside of the workers-sdk repo)
- Support a new `miniflare-shared` package for reusing esbuild plugins and zod exports provided by Miniflare
