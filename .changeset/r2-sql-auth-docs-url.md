---
"wrangler": patch
---

Update R2 SQL error messages to link to correct authentication docs

The error messages shown when `WRANGLER_R2_SQL_AUTH_TOKEN` is missing or when a 403 is returned now link to the correct documentation page at `https://developers.cloudflare.com/r2-sql/query-data/#authentication`, which contains step-by-step token creation instructions. The previous URL pointed to a troubleshooting page that did not cover token creation.
