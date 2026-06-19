---
"wrangler": minor
---

Add `getEnv()` to `createTestHarness()` Worker handles

Tests can now access the full `env` object for a Worker with `await server.getWorker<Env>().getEnv()`, including vars, secrets, and bindings.
