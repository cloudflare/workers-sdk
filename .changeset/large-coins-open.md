---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add `bundling_external` configuration option for marking modules as external during bundling

You can now configure modules to be excluded from bundling using the `bundling_external` option in your Wrangler configuration:

```json
{
	"bundling_external": ["external-module", "another-external-module"]
}
```

This corresponds to esbuild's `external` option and is useful when you have modules that should be resolved at runtime rather than bundled. The option is inheritable, so it can be set at the top level or per-environment.

Additionally, when a module cannot be resolved during bundling, Wrangler now suggests using `bundling_external` or `alias` to fix the issue.
