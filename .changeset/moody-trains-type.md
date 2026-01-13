---
"wrangler": minor
---

Collect bindings from all environments when running `wrangler types`

Previously, `wrangler types` only generated TypeScript types for bindings defined in the top-level configuration (or a single environment when using `--env`). Now, by default, it collects & generates types for bindings from **all environments** in your configuration.

This ensures your generated types include all bindings that might be used across different deployment environments (e.g., staging, production), preventing TypeScript errors when accessing environment-specific bindings.

An example with a configuration that has different bindings per environment:

```json
{
	"vars": {
		"API_URL": "https://api.example.com"
	},
	"env": {
		"staging": {
			"vars": {
				"DEBUG": "true"
			}
		},
		"production": {
			"kv_namespaces": [
				{
					"binding": "CACHE",
					"id": "abc123"
				}
			]
		}
	}
}
```

Running `wrangler types` will now generate types for `API_URL`, `DEBUG`, and `CACHE` bindings.

**Behavior:**

- `wrangler types` - Collects bindings from top-level AND all named environments
- `wrangler types --env=staging` - Collects bindings ONLY from the specified environment

**Note:** If the same binding name exists with different types across environments (e.g., `CACHE` is a KV namespace in one environment but an R2 bucket in another), an error will be thrown to prevent type conflicts.
