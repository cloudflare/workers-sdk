---
"wrangler": patch
---

feat: dev+envs

This implements service environments + `wrangler dev`. Fairly simple, it just needed the right url when creating the edge preview token.

I tested this by publishing a service under one env, adding secrets under it in the dashboard, and then trying to dev under another env, and verifying that the secrets didn't leak.
