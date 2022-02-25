---
"wrangler": patch
---

feat: tail+envs

This implements service environment support for `wrangler tail`. Fairly simple, we just generate the right URLs. wrangler tail already works for legacy envs, so there's nothing to do there.
