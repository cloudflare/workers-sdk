---
"wrangler": patch
---

Prevent `wrangler dev` crash when source-mapping a truncated error chunk

When a worker logs many errors in quick succession, the stderr chunks received by `wrangler dev` can be truncated mid-stack-frame, leaving a call site with an invalid column number. The source map library throws in that case, which was crashing the wrangler process entirely. The error is now caught and the original (un-source-mapped) text is returned instead.
