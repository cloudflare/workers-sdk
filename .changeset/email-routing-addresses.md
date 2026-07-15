---
"wrangler": minor
---

Add a top-level `addresses` field to Wrangler configuration for Email Routing

You can now declare the inbound email addresses handled by your Worker directly in `wrangler.json`:

```json
{
	"name": "my-worker",
	"main": "src/index.ts",
	"compatibility_date": "2026-05-21",
	"addresses": ["support@example.com", "*@example.com"]
}
```
