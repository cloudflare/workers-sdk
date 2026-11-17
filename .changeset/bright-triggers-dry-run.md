---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Show configured trigger targets during experimental `wrangler triggers deploy --dry-run`

Dry runs now print a "Would deploy" summary of routes, custom domains, cron schedules, Queue producers and consumers, Workflows, event triggers, and Email Routing addresses instead of exiting without a summary. Explicitly empty cron schedules are shown as removing all schedules. The preview makes no API requests or authentication checks; when workers.dev is enabled, it reports that setting without looking up the account's subdomain.

External Workflow configuration is validated before previewing or deploying triggers, so dry runs reject invalid configuration and real trigger deployments fail before changing any targets.
