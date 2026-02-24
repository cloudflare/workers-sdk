---
"@cloudflare/workers-utils": patch
---

Add `removeDir` and `removeDirSync` helpers with automatic retry logic for Windows EBUSY errors

These new helpers wrap `fs.rm`/`fs.rmSync` with `maxRetries: 5` and `retryDelay: 100` to handle cases where file handles aren't immediately released (common on Windows with workerd).
The async helper also has a `fireAndForget` option to silently swallow errors and not await removal.

This improves reliability of cleanup operations across the codebase.
