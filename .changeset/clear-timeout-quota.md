---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Fix local Workflows hitting the timer quota on long runs

Long local workflows with many sequential `step.do()` calls no longer fail from timer exhaustion. Step timeout timers are now cancelled when a step finishes or fails, instead of remaining until the original timeout deadline.
