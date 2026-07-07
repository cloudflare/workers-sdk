---
"miniflare": patch
"wrangler": patch
---

Key local rate limit counters by `namespace_id` instead of binding name

`wrangler dev` and Miniflare previously tracked each rate limit binding's counter by its binding name, so two bindings that referenced the same `namespace_id` were treated as separate limiters. Counters are now keyed by `namespace_id`, matching production: bindings that share a `namespace_id` share a limit, while distinct namespaces stay isolated. This also re-enables rate limit bindings in multiworker `wrangler dev` sessions, where they were previously stripped from secondary Workers to avoid a startup crash.
