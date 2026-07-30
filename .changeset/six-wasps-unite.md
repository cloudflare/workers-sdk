---
"@cloudflare/vitest-pool-workers": minor
---

Breaking change: rRemove several options from the `miniflare` override options

The following options have been removed from the `miniflare` override options, as they were not intended to be exposed, were not functional, or have been superseded by other options:

- `wrappedBindings`
- `cacheWarnUsage`
- `fetchMock`: you should use `outboundService` instead
- `containerEngine`: containers were not supported in vitest-pool-workers. Consider using [`createTestHarness()`](https://developers.cloudflare.com/workers/testing/test-harness/) instead if you want to test against actual containers.

Additionally, `cache` has been deprecated and renamed to `cacheAPI`, but `cache` remains functional.
