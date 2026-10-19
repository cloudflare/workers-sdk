---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"wrangler": minor
---

Add a `jurisdiction` setting to Workflows

A Workflow defined by the Worker can now set the jurisdiction that its instances run and store their data in, on either a `workflows` binding or a `workflow` export:

```jsonc
{
	"workflows": [
		{
			"binding": "MY_WORKFLOW",
			"name": "my-workflow",
			"class_name": "MyWorkflow",
			"jurisdiction": "eu",
		},
	],
}
```

The accepted values are `eu`, `fedramp`, and `us`. `wrangler deploy` and `wrangler triggers deploy` send the jurisdiction when they create or update the Workflow. A Workflow's jurisdiction is set when it is created and cannot be changed afterwards, so `wrangler deploy` and `wrangler versions upload` stop before uploading when an existing Workflow has a different jurisdiction from the configured one. Leaving `jurisdiction` out keeps the Workflow's existing jurisdiction. `@cloudflare/config` adds the setting to `exports.workflow()`, `cf migrate` carries it over, and `wrangler workflows describe` prints it. Local development ignores it.
