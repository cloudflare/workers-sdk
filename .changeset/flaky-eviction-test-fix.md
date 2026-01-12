---
"miniflare": patch
---

Fix flaky Durable Object eviction tests on Windows

Fixed cleanup in concurrent Durable Object eviction tests to use `onTestFinished` from the test context (instead of the imported version) with `disposeWithRetry` for proper scoping with concurrent tests.
