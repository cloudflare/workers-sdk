---
"wrangler": minor
---

allow --name and --env args on wrangler deploy

Previously it was not possible to provide a Worker name as a command line argument at the same time as setting the Wrangler environment.
Now specifying `--name` is supported and will override any names set in the Wrangler config:

**wrangler.json**

```json
{
	"name": "config-worker"
	"env": {
		"staging": { "name": "config-worker-env" }
	}
}
```

| Command                                          | Previous (Worker name) | Proposed (Worker name) | Comment                               |
| ------------------------------------------------ | ---------------------- | ---------------------- | ------------------------------------- |
| wrangler deploy --name=args-worker               | "args-worker"          | "args-worker"          | CLI arg used                          |
| wrangler deploy --name=args-worker --env=staging | _Error_                | "args-worker"          | CLI arg used                          |
| wrangler deploy --name=args-worker --env=prod    | _Error_                | "args-worker"          | CLI arg used                          |
| wrangler deploy                                  | "config-worker"        | "config-worker"        | Top-level config used                 |
| wrangler deploy --env=staging                    | "config-worker-env"    | "config-worker-env"    | Named env config used                 |
| wrangler deploy --env=prod                       | "config-worker-prod"   | "config-worker-prod"   | CLI arg and top-level config combined |
