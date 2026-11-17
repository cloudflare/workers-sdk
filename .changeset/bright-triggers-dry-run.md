---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Show configured trigger targets during experimental `wrangler triggers deploy --dry-run`

Dry runs now print a "Would deploy" summary of routes, custom domains, cron schedules, Queue producers and consumers, Workflows, event triggers, and Email Routing addresses instead of exiting without a summary. Explicitly empty cron schedules and Email Routing addresses are shown as removals. The preview makes no API requests or authentication checks; when workers.dev is enabled, it reports that setting without looking up the account's subdomain.
