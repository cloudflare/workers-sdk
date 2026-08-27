---
"wrangler": minor
---

Add support for configuring a per-workflow max concurrency limit via `workflows[].concurrency.limit` in your Wrangler config.

The limit is the maximum number of Workflow instances that can run concurrently. It is validated as a positive integer and persisted on deploy; the ceiling is enforced server-side. Concurrency is ignored in local development.

```jsonc
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"concurrency": { "limit": 10 },
		},
	],
}
```
