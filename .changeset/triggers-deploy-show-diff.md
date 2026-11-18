---
"wrangler": minor
---

Add `--show-diff` flag to `wrangler triggers deploy`

When `--show-diff` is passed, the command fetches the currently deployed trigger configuration from the remote worker and displays a colored diff against the local configuration before deploying. This covers routes, custom domains, cron schedules, and the `workers_dev`/`preview_urls` subdomain settings. Route and custom-domain lists are fetched only when that category has local entries to deploy, avoiding unnecessary permission requirements. Queue consumers and event triggers are not compared.

The flag also works with `--dry-run` to preview these changes without actually deploying. Displaying a diff requires authentication, including during a dry run.
