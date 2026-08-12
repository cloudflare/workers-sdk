---
"@cloudflare/config": patch
"miniflare": patch
---

Default local Analytics Engine dataset names in Miniflare

Analytics Engine dataset bindings without an explicit `name` now get the same local default identifier behavior as R2 and queue bindings.
