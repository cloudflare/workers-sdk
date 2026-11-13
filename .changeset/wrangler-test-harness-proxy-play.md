---
"wrangler": patch
---

Wait for the proxy worker to finish its reload message before `createTestHarness()` reports a session ready

This prevents `close()` or `reset()` immediately after `listen()` or `reset()` from tearing down an in-flight proxy request, which could cause an uncaught `setTypeOfService EINVAL` error on macOS.
