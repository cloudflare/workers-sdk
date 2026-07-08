---
"wrangler": minor
---

Add `listDurableObjectIds()` to `createTestHarness` Worker handles

Tests using `createTestHarness` can now list persisted Durable Object instance IDs for a Durable Object binding. This helps integration tests discover objects created by app behavior without adding test-only endpoints.
