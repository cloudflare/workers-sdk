---
"wrangler": minor
---

Add `--keep-vars` flag to `wrangler versions upload`, matching the existing behavior in `wrangler deploy`. When set, environment variables configured via the dashboard are preserved rather than being deleted before the upload.
