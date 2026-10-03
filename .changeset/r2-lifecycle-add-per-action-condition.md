---
"wrangler": patch
---

Apply each action's own condition in `wrangler r2 bucket lifecycle add`

When a lifecycle rule was added with both expiration and Infrequent Access transition flags, both actions read their condition from the same list of flags, which checked `--expire-days` first. `--expire-days 365 --ia-transition-days 30` therefore transitioned objects after 365 days instead of 30, and `--expire-date 2027-01-01 --ia-transition-days 30` deleted objects after 30 days instead of on the given date. Expiration now only reads `--expire-days`/`--expire-date`, and transition only reads `--ia-transition-days`/`--ia-transition-date`.
