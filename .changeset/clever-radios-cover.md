---
"wrangler": minor
---

fix: improve Workers Sites asset upload reliability

- Wrangler no longer buffers all assets into memory before uploading. This should prevent out-of-memory errors when publishing sites with many large files.
- Wrangler now limits the number of in-flight asset upload requests to 5, fixing the `Too many bulk operations already in progress` error.
- Wrangler now correctly logs upload progress. Previously, the reported percentage was per upload request group, not across all assets.
- Wrangler no longer logs all assets to the console by default. Instead, it will just log the first 100. The rest can be shown by setting the `WRANGLER_LOG=debug` environment variable. A splash of colour has also been added.
