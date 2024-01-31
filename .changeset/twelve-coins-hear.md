---
"wrangler": patch
---

fix: do not attempt login during dry-run

The "standard pricing" warning was attempting to make an API call that was causing a login attempt even when on a dry-run.
Now this warning is disabled during dry-runs.

Fixes #4723
