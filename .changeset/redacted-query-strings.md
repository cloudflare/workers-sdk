---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add query string redaction to Workers observability configuration

Set `observability.redact_query_string` in `wrangler.json` or `observability.redactQueryString` in the experimental `cloudflare.config.ts` format to remove query strings from request URLs in logs and traces.
