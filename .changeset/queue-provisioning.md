---
"wrangler": minor
---

feat: Add automatic queue provisioning

Wrangler can now automatically create Cloudflare Queues during deployment when using the `--x-provision` flag (enabled by default). This works for both queue producers and consumers.

Example configuration:

```jsonc
// wrangler.jsonc
{
	"queues": {
		"producers": [
			{
				"binding": "MY_QUEUE",
				"queue": "my-queue-name",
			},
		],
		"consumers": [
			{
				"queue": "my-queue-name",
				"max_batch_size": 10,
			},
		],
	},
}
```

When you run `wrangler deploy`, if "my-queue-name" doesn't exist, it will be created automatically. This provides a seamless "just works" experience similar to KV, D1, and R2 provisioning.

Key features:

- Automatic queue creation for both producers and consumers
- De-duplication: queues referenced by both producers and consumers are only created once
- Inheritance: existing queue bindings from deployed workers are inherited
- Connects to existing queues by name without re-creating them
