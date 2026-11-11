---
"miniflare": minor
---

Nest Workflow binding limits under `unsafeConfig` in the experimental Miniflare configuration API

Workflow settings belong in the `exports` definition. Move the binding-level compatibility option from `limits` to `unsafeConfig.limits` to make its status explicit. Existing Wrangler and Miniflare v4 configuration continues to work through the compatibility adapter.
