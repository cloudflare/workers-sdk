---
"wrangler": minor
---

Add deploy support for the experimental `secrets` configuration property

When the new `secrets` property is defined, `wrangler deploy` now validates that all secrets declared in `secrets.required` are configured on the Worker before the deploy succeeds. If any required secrets are missing, the deploy fails with a clear error listing which secrets need to be set.

When `secrets` is not defined, the existing behavior is unchanged.

```jsonc
// wrangler.jsonc
{
	"secrets": {
		"required": ["API_KEY", "DB_PASSWORD"],
	},
}
```
