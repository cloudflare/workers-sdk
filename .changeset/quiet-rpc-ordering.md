---
"@cloudflare/vitest-pool-workers": patch
---

Preserve same-stub RPC call order for wrapped Worker and Durable Object entrypoints

Previously, dynamically wrapped RPC methods could resolve and invoke out of order when many calls were fired without awaiting each individual call. This now queues method resolution per wrapper instance so calls begin in the order they were received.
