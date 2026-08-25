---
"wrangler": minor
---

Add `default_retention` to Workflow bindings for configuring how long instances are retained

Workflow instances are retained for an account-wide default period after they finish. You can now set a per-Workflow default in your Wrangler configuration, applied to instances that do not specify their own retention:

```jsonc
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"default_retention": {
				"success_retention": "3 days",
				"error_retention": "7 days",
			},
		},
	],
}
```

Each side is optional and accepts either a duration string such as `"3 days"` or a whole number of milliseconds. Durations are interpreted by the Workflows API, which also caps them at your account's retention limit.
