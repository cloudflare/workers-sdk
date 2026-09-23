---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/config": minor
"miniflare": minor
"wrangler": minor
---

Support `workflow` entries in the `exports` configuration map

A Worker can now declare the Workflows it defines in `exports`, keyed by the `WorkflowEntrypoint` class name:

```jsonc
{
	"exports": {
		"MyWorkflow": {
			"type": "workflow",
			"name": "my-workflow",
			"limits": { "steps": 100 },
		},
	},
}
```

`wrangler deploy` and `wrangler versions upload` send these entries to the upload API by name, and `wrangler deploy` and `wrangler triggers deploy` provision the Workflow with its `limits`, just as they do for `workflows` bindings owned by the Worker. A Workflow may be declared both as a binding and as an export, as long as both declarations use the same class and do not set different `limits`. `@cloudflare/config` adds the matching `exports.workflow()` helper. Local development does not yet act on these entries; the new `workflowExports` Miniflare option lays the groundwork for exposing configured Workflows on `ctx.exports`.
