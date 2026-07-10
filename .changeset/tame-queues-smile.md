---
"wrangler": minor
---

Add `createTestHarness` support for dispatching queue handlers

Tests can now call `server.getWorker().queue(queueName, messages, metadata)` to dispatch directly to a Worker's `queue()` handler and assert the returned ack/retry state without adding a test-only Queue producer binding.
