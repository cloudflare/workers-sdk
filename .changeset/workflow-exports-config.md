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
			"schedules": "0 * * * *",
		},
	},
}
```

A `workflow` export accepts the same settings as a `workflows` binding: `limits`, `concurrency`, `schedules`, and `default_retention`. `wrangler deploy` and `wrangler versions upload` send these entries to the upload API by name, and `wrangler deploy` and `wrangler triggers deploy` provision the Workflow with its settings, just as they do for `workflows` bindings owned by the Worker. A Workflow may be declared both as a binding and as an export, as long as both declarations use the same class and do not set the same setting to different values. `@cloudflare/config` adds the matching `exports.workflow()` helper. Local development does not yet act on these entries.
