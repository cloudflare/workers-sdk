---
"@cloudflare/workers-shared": patch
"miniflare": patch
---

Fix `TypeError: rules is not iterable` in the router-worker when `static_routing` is configured without `user_worker` rules

The router-worker's static-routing include-rule evaluation passed `config.static_routing.user_worker` directly to the matcher, which iterates with `for...of`. When `static_routing` was set but `user_worker` was omitted, the matcher threw `TypeError: rules is not iterable` and failed the request. The adjacent `asset_worker` branch already falls back to `[]` in this case; the `user_worker` branch now does the same.
