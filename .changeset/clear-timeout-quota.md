---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Fix local Workflows hitting the timer quota on long runs

Long local workflows no longer fail from timer exhaustion. Step timeout timers, sleep, waitForEvent, and grace-period waits now cancel their underlying timers when finished or aborted, instead of remaining until their original deadlines.
