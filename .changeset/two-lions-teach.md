---
"wrangler": patch
---

fix: Fix `--binding` option for `wrangler pages dev`.

We'd broken this with #581. This reverts that PR, and fixes it slightly differently. Also added an integration test to ensure we don't regress in the future.
