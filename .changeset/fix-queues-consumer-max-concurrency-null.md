---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Allow `max_concurrency: null` on Queues consumers

Setting `max_concurrency` to `null` on a `[[queues.consumers]]` entry opts the consumer in to the platform's maximum concurrency (auto-scaling), as documented [here](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/). Wrangler's config validation was incorrectly rejecting this value with an error, even though the config type allows `number | null`:

```jsonc
// wrangler.json
{
	"queues": {
		"consumers": [{ "queue": "my-queue", "max_concurrency": null }]
	}
}
```

`max_concurrency: null` is now accepted.
