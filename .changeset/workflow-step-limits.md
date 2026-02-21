---
"wrangler": minor
"miniflare": minor
"@cloudflare/workflows-shared": minor
"@cloudflare/workers-utils": minor
---

Add configurable step limits for Workflows

You can now set a maximum number of steps for a Workflow instance via the `limits.steps` configuration in `wrangler.toml` / `wrangler.json`. When a Workflow instance exceeds this limit, it will fail with an error indicating the limit was reached.

```jsonc
// wrangler.json
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"limits": {
				"steps": 5000,
			},
		},
	],
}
```

The `steps` value must be an integer between 1 and 100,000. If not specified, the default limit of 10,000 steps is used. Step limits are also enforced in local development via `wrangler dev`.
