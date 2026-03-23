---
"@cloudflare/workflows-shared": patch
---

Fix `waitForEvent` delivering events to stale waiters after timeout.

When a `step.waitForEvent()` call timed out, its resolver was not removed from the workflow's internal waiters map. This meant the next `step.waitForEvent()` for the same event type would have its incoming event consumed by the dead resolver instead of the live one, causing the workflow to hang indefinitely.
