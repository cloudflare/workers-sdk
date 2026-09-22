---
"miniflare": patch
---

Reduce `dispatchFetch()` connection exhaustion under sustained local and CI workloads

Repeated `GET` and `HEAD` dispatches now reuse runtime connections instead of creating a new connection for every request. This prevents read-heavy Miniflare test suites from exhausting the host's available ephemeral ports while preserving safe handling for requests that cannot be transparently retried.
