---
"@cloudflare/config": minor
---

Use camelCase for Workflow export retention settings

The experimental `@cloudflare/config` API now accepts `defaultRetention`, `successRetention`, and `errorRetention`, consistently with its other authored configuration fields. These settings are converted to Wrangler's snake_case configuration shape at the integration boundary.
