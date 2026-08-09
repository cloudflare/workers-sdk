---
"miniflare": patch
---

Make `Miniflare#dispose()` idempotent for repeated and concurrent calls

Concurrent callers and calls after a successful teardown now reuse the same result, so calling `dispose()` more than once no longer throws. A failed teardown remains retryable.
