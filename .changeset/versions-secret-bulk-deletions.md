---
"wrangler": minor
---

Support deleting secrets with `wrangler versions secret bulk`

Set a secret's value to `null` in JSON input to remove it from the new Worker version. Bulk output now distinguishes between created and deleted secrets, so retrying `wrangler secret bulk` with `wrangler versions secret bulk` preserves requested deletions. Deploy the new version with `wrangler versions deploy` to apply the changes to production traffic.
