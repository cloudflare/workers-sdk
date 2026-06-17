---
"@cloudflare/workflows-shared": patch
---

Add step context to Workflows rollback handlers

Rollback handlers now receive the original step context under `ctx`, making `ctx.step.name`, `ctx.step.count`, `ctx.attempt`, and the resolved step `config` available during rollback. The legacy `stepName` field remains available and is equivalent to `${ctx.step.name}-${ctx.step.count}`.

`rollbackConfig` is now limited to retry and timeout settings, matching the behavior supported by rollback handlers.
