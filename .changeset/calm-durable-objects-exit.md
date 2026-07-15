---
"@cloudflare/vitest-pool-workers": patch
---

Fix test runs hanging after a Durable Object logs and rejects `blockConcurrencyWhile()`

Console messages emitted from another Durable Object are now buffered until execution returns to the test runner, avoiding I/O that cannot complete after the object's input gate breaks.
