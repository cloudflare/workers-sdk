---
"@cloudflare/workers-utils": minor
---

Add `retryWhileVersionNotReadable()` and an optional extra-retryable predicate to `retryOnAPIFailure()`

`retryWhileVersionNotReadable(read, logger)` retries a Worker version read for up to about 12 seconds while the API reports the version as not found, which can happen for a few seconds after an upload. `retryOnAPIFailure()` accepts a new optional last argument for treating further errors as transient.
