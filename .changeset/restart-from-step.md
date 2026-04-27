---
"@cloudflare/workflows-shared": minor
"miniflare": minor
---

Add restart from step support for local Workflows development

Workflow instances can now be restarted from a specific step in local development. When restarting from a step, all earlier steps preserve their cached results and replay instantly, while the target step and everything after it re-execute.

The `WorkflowInstance.restart()` method now accepts an optional `{ from: { name, count?, type? } }` parameter to specify which step to restart from.
