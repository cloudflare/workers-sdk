---
"wrangler": minor
---

Add `schedule` property to Workflow bindings for cron-based triggering

Workflow bindings in `wrangler.json` now accept an optional `schedule` field that configures one or more cron expressions to automatically trigger new workflow instances on a schedule.

```jsonc
// wrangler.json
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"schedule": "0 9 * * 1",
		},
	],
}
```

Multiple schedules can be provided as an array:

```jsonc
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"schedule": ["0 9 * * 1", "0 17 * * 5"],
		},
	],
}
```

The schedule is sent to the Workflows control plane on `wrangler deploy`. Configuring `schedule` on a workflow binding that references an external `script_name` is an error — the schedule must be configured on the worker that defines the workflow.
