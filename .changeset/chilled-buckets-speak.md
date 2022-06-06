---
"wrangler": patch
---

polish: add cron trigger to wrangler.toml when new Scheduled Worker is created

When `wrangler init` is used to create a new Scheduled Worker a cron trigger (1 \* \* \* \*) will be added to wrangler.toml, but only if wrangler.toml is being created during init. If wrangler.toml exists prior to running `wrangler init` then wrangler.toml will remain unchanged even if the user selects the "Scheduled Handler" option. This is as per existing tests in init.test.ts that ensure wrangler.toml is never overwritten after agreeing to prompts. That can change if it needs to.
