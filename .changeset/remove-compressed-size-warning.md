---
"wrangler": patch
---

Update bundle size warning thresholds to use uncompressed size instead of gzip size

The compressed script size limits (3 MiB free / 10 MiB paid) have been removed server-side in favor of a single 64 MiB uncompressed limit. The bundle size reporter now compares the uncompressed bundle size against this 64 MiB limit for its color-coded warnings, instead of comparing gzip size against the old 3 MiB compressed limit.
