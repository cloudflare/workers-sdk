---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Show configured trigger targets during experimental `wrangler triggers deploy --dry-run`

Dry runs now print a "Would deploy" summary of routes, custom domains, cron schedules, Queue producers and consumers, Workflows, and event triggers instead of exiting without a summary. The preview makes no API requests or authentication checks; when workers.dev is enabled, it reports that setting without looking up the account's subdomain.
