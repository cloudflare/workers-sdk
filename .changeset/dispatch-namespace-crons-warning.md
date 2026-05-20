---
"wrangler": patch
---

Warn when `triggers.crons` are configured alongside `--dispatch-namespace`

When deploying with `--dispatch-namespace`, cron triggers are not supported and were silently dropped. Wrangler now emits a warning in this situation so users are aware their cron configuration will be ignored.
