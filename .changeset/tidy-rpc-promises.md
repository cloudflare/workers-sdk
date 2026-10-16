---
"miniflare": patch
---

Fix Workflow creation hanging on the first call through the platform proxy or test harness

Workflow storage operations now use the native disk service instead of calling back into Node, so they can complete while Node waits for the RPC result.
