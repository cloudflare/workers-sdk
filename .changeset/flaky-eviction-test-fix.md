---
"miniflare": patch
---

fix flaky Durable Object eviction test on Windows

Added timing buffer (10.5s instead of 10s) and explicit timeout configuration to the Durable Object eviction test to account for timing variability on Windows CI runners. Also fixed cleanup to use try/finally instead of useDispose to avoid interference between concurrent tests.
