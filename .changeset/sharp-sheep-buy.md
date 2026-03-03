---
"wrangler": minor
---

Add type generation for the experimental `secrets` configuration property

When the new `secrets` property is defined, `wrangler types` now generates typed bindings from the names listed in `secrets.required`.

When `secrets` is defined at any config level, type generation uses it exclusively and no longer infers secret names from `.dev.vars` or `.env` files. This enables running type generation in environments where these files are not present.

Per-environment secrets are supported. Each named environment produces its own interface, and the aggregated `Env` marks secrets that only appear in some environments as optional.

When `secrets` is not defined, the existing behavior is unchanged.

```jsonc
// wrangler.jsonc
{
	"secrets": {
		"required": ["API_KEY", "DB_PASSWORD"],
	},
}
```
