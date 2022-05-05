---
"wrangler": patch
---

chore: minify bundle, don't ship sourcemaps

We haven't found much use for sourcemaps in production, and we should probably minify the bundle anyway. This will also remove an dev only warnings react used to log.
