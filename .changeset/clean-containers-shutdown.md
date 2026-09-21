---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Clean up local Containers during managed shutdown

Miniflare now gives Container-enabled workerd processes up to five seconds to remove application containers, networking sidecars, and snapshot volumes before forcing shutdown. Wrangler and the Vite plugin wait for Miniflare and no longer scan Docker by image tag.
