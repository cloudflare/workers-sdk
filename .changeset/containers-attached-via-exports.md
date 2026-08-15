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

The existing `containers[].class_name` direction keeps working and either direction may be used, but the two must agree: a container that names its Durable Object cannot also be claimed by a different one.

`container` is only valid on live `durable-object` exports (`created` and `expecting-transfer`) and requires `storage: "sqlite"`. Wrangler now also reports an error when:

- a `container` reference names a container that does not exist
- two Durable Object exports claim the same container
- a container and a Durable Object export disagree about which one they are linked to
- a container ends up linked to no Durable Object at all
- two containers share a `name`
- a container's `class_name` names a Durable Object whose `storage` is `legacy-kv`
- two containers are attached to the same Durable Object

That last case was previously accepted but could never work: workerd attaches a single container per Durable Object namespace, and in local development every container for a class builds into the same image tag, so one silently overwrote the other. If you have two containers on one `class_name`, give each its own Durable Object class.
