---
"wrangler": minor
---

Add additional triggers to Workflows

Workers can now declaratively start a locally defined Workflow. Configure event subscriptions under `triggers.events`; Wrangler validates each target and updates the script's event triggers during deployment.

```jsonc
{
	"triggers": {
		"events": [
			{
				"type": "cf.artifacts.repo.pushed",
				"filter": {
					"namespace": "my-namespace",
					"repo_name": "my-repo",
				},
				"targets": [
					{
						"type": "workflow",
						"workflow_name": "my-workflow",
					},
				],
			},
		],
	},
}
```
