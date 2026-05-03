---
"wrangler": patch
---

Fix `wrangler types` to generate `Fetcher` for `unsafe.bindings` entries with `type: "service"`

Previously, all entries in `unsafe.bindings` (other than `ratelimit`) generated a fallback `any` type. `wrangler types` now generates `Fetcher` for unsafe bindings declared with `type: "service"`, matching the type used for regular service bindings.
