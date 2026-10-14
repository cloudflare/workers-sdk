---
"@cloudflare/vite-plugin": minor
---

Generate Worker types from `cloudflare.config.ts`

The plugin now generates `.cloudflare/types/index.d.ts` during development and builds. Generated declarations infer bindings from `cloudflare.config.ts` and include runtime types for the configured compatibility date and flags by default. Use the top-level `types` option to disable generation or omit runtime types.

Include the configuration and generated declarations in the TypeScript configuration for your Worker:

```json
{
	"include": ["src", "cloudflare.config.ts", ".cloudflare/types"]
}
```

The `experimental.newConfig` option, including `experimental.newConfig.types`, has been removed.
