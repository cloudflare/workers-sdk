---
"@cloudflare/workers-utils": patch
---

Use the inherited Worker name when generating container names in named environments

When `containers` is declared inside a named environment and the container has no explicit `name`, the default container name was built from the environment's own `name` field. `name` is inheritable, so an environment that doesn't redeclare it left that value `undefined`, producing the error `Must have either a top level "name" and "containers.class_name" field defined, or have field "containers.name" defined.` even though a top level `name` was set — and, if the error was ignored, a container named `undefined-<class_name>-<env>`.

```jsonc
{
	"name": "my-worker",
	"env": {
		"staging": {
			"containers": [{ "class_name": "MyContainer", "image": "./Dockerfile" }],
		},
	},
}
```

`wrangler deploy --env staging` on the configuration above now generates `my-worker-mycontainer-staging`, matching the documented `worker_name-class_name[-env_name]` default. A `name` declared on the environment still takes precedence over the top level one.
