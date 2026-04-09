---
"@cloudflare/workflows-shared": minor
---

Add `step` and `config` properties to the workflow step context

The callback passed to `step.do()` now receives `ctx.step` (with `name` and `count`) and `ctx.config` (the fully resolved step configuration with defaults merged in), in addition to the existing `ctx.attempt`.
