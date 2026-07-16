---
"wrangler": patch
---

Support containers in `createTestHarness()`

Workers configured with containers can now be tested using `createTestHarness()`. The harness builds configured images and makes container-backed Durable Objects available during integration tests.
