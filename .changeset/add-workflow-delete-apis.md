---
"miniflare": minor
---

Add local support for `WorkflowInstance.delete()` and `Workflow.deleteBatch()`

The updated `@cloudflare/workers-types` now requires `delete()` on workflow instances and `deleteBatch()` on the workflow binding. These methods are now implemented in the local workflows simulator so that local dev and tests match the production API.
