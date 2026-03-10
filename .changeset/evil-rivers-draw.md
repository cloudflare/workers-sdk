---
"wrangler": minor
---

Add support for inheritable bindings in type generation

When using `wrangler types` with multiple environments, bindings from inheritable config properties (like `assets`) are now correctly inherited from the top-level config in all named environments. Previously, if you defined `assets.binding` at the top level with named environments, the binding would be marked as optional in the generated `Env` type because the type generation didn't account for inheritance.

Example:

```json
{
	"assets": {
		"binding": "ASSETS",
		"directory": "./public"
	},
	"env": {
		"staging": {},
		"production": {}
	}
}
```

Before this change, `ASSETS` would be typed as `ASSETS?: Fetcher` (optional). Now, `ASSETS` is correctly typed as `ASSETS: Fetcher` (required). This fix currently applies to the `assets` binding, with an extensible mechanism to support additional inheritable bindings in the future.
