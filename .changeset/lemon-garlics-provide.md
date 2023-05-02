---
"wrangler": patch
---

fix: failed d1 migrations not treated as errors

When a set of migrations fails, wrangler should return a non-success exit code.
