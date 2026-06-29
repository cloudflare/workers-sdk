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

Each entry is a literal recipient address or a `*@domain` catch-all. `addresses` is top-level only (it applies to every environment; setting it under `env.*` is ignored with a warning, like other top-level-only fields). Locally, Wrangler validates that the field is an array of strings; semantic checks (duplicate targets, address resolution) are performed by the Email Routing API at deploy time, and `wrangler deploy --dry-run` runs that validation without making any network calls. A non-dry-run `wrangler deploy` currently accepts the field without acting on it; applying these addresses during `wrangler deploy` follows in a later change.
