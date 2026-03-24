---
"wrangler": minor
---

Add `wrangler versions upload` support for the experimental `secrets` configuration property

When the new `secrets` property is defined, `wrangler versions upload` now validates that all secrets declared in `secrets.required` are configured on the Worker before the upload succeeds. If any required secrets are missing, the upload fails with a clear error listing which secrets need to be set.

When `secrets` is not defined, the existing behavior is unchanged.

```jsonc
// wrangler.jsonc
{
	"secrets": {
		"required": ["API_KEY", "DB_PASSWORD"],
	},
}
```
