---
"wrangler": patch
---

feat: add support for managing R2 buckets

This change introduces three new commands, which manage buckets under the current account:

- `r2 buckets list`: list information about all the buckets.
- `r2 buckets create`: create a new bucket - will error if the bucket already exists.
- `r2 buckets delete`: delete a bucket.

This brings Wrangler 2 inline with the same features in Wrangler 1.
