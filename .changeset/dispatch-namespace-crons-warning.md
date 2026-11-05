---
"@cloudflare/deploy-helpers": patch
---

Warn when cron triggers are configured alongside `--dispatch-namespace`

When deploying a user Worker to a dispatch namespace (Workers for Platforms), cron triggers are not supported, but Wrangler previously dropped them silently: schedules configured via `triggers.crons` in the Wrangler config file or the `--triggers` CLI flag never ran and no warning was shown. Wrangler now warns that cron triggers will be ignored when deploying with `--dispatch-namespace`.
