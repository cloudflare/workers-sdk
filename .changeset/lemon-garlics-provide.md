---
"wrangler": patch
---

fix: failed d1 migrations not treated as errors

This PR teaches wrangler to return a non-success exit code when a set of migrations fails.

It also cleans up `wrangler d1 migrations apply` output significantly, to only log information relevant to migrations.
