---
"@cloudflare/workflows-shared": minor
"wrangler": minor
"miniflare": minor
---

Add rollback support when terminating Workflow instances

`WorkflowInstance.terminate({ rollback: true })` now runs registered rollback handlers before marking a local Workflow instance as terminated. Wrangler also supports this via `wrangler workflows instances terminate --rollback`, including local mode.

The rollback option is only sent for terminate operations and is rejected by the Local Explorer API for pause, resume, and restart actions.
