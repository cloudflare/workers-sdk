---
"@cloudflare/workflows-shared": minor
"wrangler": minor
"miniflare": minor
---

Add individual and batch Workflow instance deletion to the runtime and SDK.

- `WorkflowInstance.delete()` deletes one instance. Self-deletion stops the current execution.
- `env.MY_WORKFLOW.deleteBatch(instanceIds)` deletes up to 100 instances and returns `{ deleted, errors }` per input position.
- `wrangler workflows instances delete <name> [id..]` deletes instances remotely or with `--local`; IDs can also come from a JSON array passed with `--filename`, with a combined limit of 100.
