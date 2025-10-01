---
"wrangler": minor
---

Add strict mode for the `wrangler deploy` command

Add a new flag: `--strict` that makes the `wrangler deploy` command be more strict and not deploy workers when the deployment could be potentially problematic. This "strict mode" currently only affects non-interactive sessions where conflicts with the remote settings for the worker (for example when the worker has been re-deployed via the dashboard) will cause the deployment to fail instead of automatically overriding the remote settings.
