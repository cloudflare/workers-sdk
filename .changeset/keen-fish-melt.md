---
"@cloudflare/workers-utils": minor
---

Add `removeDir` and `removeDirSync` helpers with automatic retry logic for Windows EBUSY errors

These new helpers wrap `fs.rm`/`fs.rmSync` with `maxRetries: 5` and `retryDelay: 100` (a `noThrow` option to silently swallow errors) to handle cases where file handles aren't immediately released (common on Windows with workerd).

This improves reliability of cleanup operations across the codebase.
