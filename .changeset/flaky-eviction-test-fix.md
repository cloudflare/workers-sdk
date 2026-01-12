---
"miniflare": patch
---

fix flaky Durable Object eviction test on Windows

Added timing buffer (11s instead of 10s) and explicit timeout configuration to the Durable Object eviction test to account for timing variability on Windows CI runners.
