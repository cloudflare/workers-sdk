---
"@cloudflare/vitest-pool-workers": patch
---

Preserve Durable Object WebSocket handler invocation order

Durable Object WebSocket events could begin executing out of order in the Workers Vitest integration when several events arrived while the test wrapper was resolving user code.

Handler invocation now preserves arrival order while still allowing asynchronous handler completion to run concurrently.
