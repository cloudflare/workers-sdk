---
"wrangler": patch
---

Fail early when `createTestHarness()` cannot start its proxy under Bun

When Bun does not deliver the proxy control request required by Miniflare, `createTestHarness()` now throws an actionable startup error. This prevents the process from remaining idle while every request to the test harness hangs indefinitely.
