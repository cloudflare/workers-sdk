---
"wrangler": patch
---

fix: don't require auth for `wrangler r2 object --local` operations

Previously, Wrangler would ask you to login when reading or writing from local R2 buckets. This change ensures no login prompt is displayed, as authentication isn't required for these operations.
