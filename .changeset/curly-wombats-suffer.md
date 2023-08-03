---
"wrangler": minor
---

secret:bulk exit 1 on failure
Previously `secret"bulk` would only log an error on failure of any of the upload requests.
Now when 'secret:bulk' has an upload request fail it throws an Error which sends an `process.exit(1)` at the root `.catch()` signal.
This will enable error handling in programmatic uses of `secret:bulk`.
