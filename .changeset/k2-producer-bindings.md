---
"wrangler": minor
"miniflare": minor
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-auth": minor
---

Add beta K2 producer bindings for existing streams

Configure a stream created through Wrangler, the Dashboard, or the API in `wrangler.json`:

```jsonc
{
	"k2": [
		{
			"binding": "ORDERS",
			"stream": "0123456789abcdef0123456789abcdef",
			"remote": true,
		},
	],
}
```

The binding supports `env.ORDERS.send([{ content: new TextEncoder().encode("order"), headers: { event: "order.created" } }])`. Batches use either all `ArrayBuffer` or all `Uint8Array` content. Check the returned `success` value, handle rejected RPC promises, and retry only when the returned error explicitly allows it. Mixed batches reject the promise during remote development. Generated environment types describe this producer contract without requiring a separate application dependency.

K2 requires an enabled account. Deployment credentials need Worker deployment and K2 configuration-read access. Default Wrangler logins now request the K2 OAuth scopes; existing OAuth users should run `wrangler login` again to grant the new permissions. Local simulation is not available: `remote: true` uses a real K2 stream during development. Consumption is not part of this Worker binding.
