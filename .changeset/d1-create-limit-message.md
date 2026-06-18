---
"wrangler": patch
---

Improve the `wrangler d1 create` error message when the database limit is reached

When `d1 create` fails because the account has hit its database cap, Wrangler now tailors the guidance to the account's plan. Free-plan users get a Workers Paid upgrade link alongside a no-cost alternative (deleting an unused database), while accounts already on a paid plan are pointed at the limit-increase guidance. Previously a single generic message applied to everyone regardless of plan.
