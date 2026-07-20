---
"wrangler": minor
---

Add `exclude_packages` option to `dependencies_instrumentation` configuration

The `dependencies_instrumentation` config object now accepts an optional `exclude_packages` field — an array of package name patterns (with glob-style `*` wildcards) to exclude from the dependency metadata collected during deploy and version uploads.

```jsonc
// wrangler.json
{
	"dependencies_instrumentation": {
		"exclude_packages": ["@internal/*", "secret-tool"],
	},
}
```
