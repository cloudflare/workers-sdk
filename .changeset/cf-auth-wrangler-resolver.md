---
"wrangler": patch
---

Use the shared env-credential resolver from `@cloudflare/workers-auth`

No user-facing behaviour change. Credential resolution order (global API key + email → `CLOUDFLARE_API_TOKEN` → stored OAuth token) is preserved.
