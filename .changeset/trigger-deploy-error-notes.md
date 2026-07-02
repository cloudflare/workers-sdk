---
"wrangler": patch
---

Surface underlying API error details in "Some triggers failed to deploy" message

Previously, when a trigger (workflow, schedule, custom domain) failed to deploy, Wrangler only showed the generic "A request to the Cloudflare API (...) failed." message without the actual reason. The real cause (e.g. `cron_requires_paid_plan`) was only visible with `WRANGLER_LOG=debug`.

Now the specific API error notes are included directly in the error message, so users immediately see why a trigger deployment failed.
