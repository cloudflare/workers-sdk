---
"wrangler": patch
---

Preserve API binding configuration in `init --from-dash`

Wrangler now prefers the canonical API identifier for D1 bindings, `database_id`, when creating Worker versions and when `init --from-dash`. Wrangler continues to support the deprecated `id` field when used. And for private internal use, Wrangler also preserves an AI binding's `staging` configuration and a service binding's `cross_account_grant` property.
