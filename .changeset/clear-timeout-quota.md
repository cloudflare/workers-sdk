---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Cancel local Workflow step timeout timers when the step finishes

Each `step.do()` used to leave its 10-minute `scheduler.wait()` running after the step succeeded, so a few thousand sequential steps hit workerd's 10,000-timer quota. The wait now receives the step abort signal so the native timer is cleared.
