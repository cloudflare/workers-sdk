---
"@cloudflare/config": patch
"miniflare": patch
---

Default local Analytics Engine dataset names in Miniflare

Analytics Engine dataset bindings without an explicit `name` now fallback to the worker and binding name as a default.
