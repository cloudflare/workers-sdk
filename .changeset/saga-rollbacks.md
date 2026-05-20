---
"@cloudflare/workflows-shared": minor
---

Add saga rollback support for local Workflows development

Workflow steps can now register a compensation callback with trailing rollback options: `step.do(name, fn, { rollback })` and `step.do(name, config, fn, { rollback, rollbackConfig })`. When the workflow fails, the local engine runs every registered rollback in reverse step-start order (LIFO), giving steps the opportunity to undo their side effects.

Each rollback executes through an internal rollback-scoped `Context.do`, so it inherits the existing retry / timeout / attempt-tracking machinery. `rollbackConfig` lets users override the per-rollback config.

Note: the public rollback option type lands with workerd's `workflows_step_rollback` compat flag (PR cloudflare/workerd#6330). Until that ships, the trailing rollback options only flow through when called through the StepPromise wrapper from a worker that has the flag enabled.
