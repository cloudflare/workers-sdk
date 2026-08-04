---
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Allow containers to be attached to a Durable Object from its `exports` entry

A container can now be linked to its Durable Object from the export side, using a new `container` field that names an entry in the `containers` array. As a result `containers[].class_name` is now optional — a container that is referenced this way only needs a `name`:

```jsonc
{
	"name": "my-worker",
	"main": "worker.js",
	"compatibility_date": "2026-07-01",
	"containers": [
		{ "name": "my-container", "image": "./Dockerfile", "max_instances": 1 },
	],
	"exports": {
		"MyContainerDO": {
			"type": "durable-object",
			"storage": "sqlite",
			"container": "my-container",
		},
	},
}
```

This decouples container configuration from the Durable Object class, which is a prerequisite for configuring containers as standalone resources. The existing `containers[].class_name` direction keeps working, and either direction may be used, but a Durable Object and its container must reference each other consistently when both are set.

`container` is only valid on live `durable-object` exports (`created` and `expecting-transfer`) and requires `storage: "sqlite"`. Wrangler now also reports an error when a `container` reference names a container that does not exist, when two Durable Object exports claim the same container, when a container ends up linked to no Durable Object at all, and when two containers share a name.
