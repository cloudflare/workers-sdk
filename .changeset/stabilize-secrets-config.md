---
"@cloudflare/workers-utils": minor
---

Stabilize the `secrets` configuration property

The `secrets` property in the Wrangler config file is no longer experimental and will no longer emit an experimental warning when used. Required secrets are validated during local development and deploy, and used as the source of truth for type generation.

```json
{
	"secrets": {
		"required": ["API_KEY", "DB_PASSWORD"]
	}
}
```
