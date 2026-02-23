---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add `cache` configuration option for enabling worker cache (experimental)

You can now enable cache before worker execution using the new `cache` configuration:

```jsonc
{
	"cache": {
		"enabled": true,
	},
}
```

This setting is environment-inheritable and opt-in. When enabled, cache behavior is applied before your worker runs.

Note: This feature is experimental. The runtime API is not yet generally available.
