---
"wrangler": minor
---

Add Artifacts event triggers for Workflows

Workers can now declaratively start a locally defined Workflow in response to documented Artifacts repository events. Configure event subscriptions under `triggers.events`; Wrangler validates each target and updates the script's event triggers during deployment.

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
