---
"wrangler": minor
---

Add `--show-diff` flag to `wrangler triggers deploy`

When `--show-diff` is passed, the command fetches the currently deployed trigger configuration from the remote worker and displays a colored diff against the local configuration. This covers routes, custom domains, cron schedules, and the `workers_dev`/`preview_urls` subdomain settings.

The flag also works with `--dry-run` to preview what trigger changes would be applied without actually deploying.
