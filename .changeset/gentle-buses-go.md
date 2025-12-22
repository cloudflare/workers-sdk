---
"miniflare": patch
"wrangler": patch
---

Fix the `curl` command shown when warning the user about running `wrangler dev` without `--test-scheduled` when a cron trigger is included.

Previously, when running `wrangler dev` with a scheduled trigger/cron configured but without the `--test-scheduled` flag, the warning message displayed `undefined` for the port in the example curl command:

```
curl "http://127.0.0.1:undefined/cdn-cgi/handler/scheduled"
```

This fix ensures the correct port is now shown in the warning message.
