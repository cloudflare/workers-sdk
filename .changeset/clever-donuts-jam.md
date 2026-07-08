---
"miniflare": minor
"@cloudflare/vitest-pool-workers": patch
---

Add `listDurableObjectIds()` to Miniflare

Miniflare now exposes `listDurableObjectIds()` for listing persisted Durable Object instance IDs by binding name. The Vitest pool now uses this shared Miniflare API internally instead of duplicating Miniflare's storage listing logic.
