---
"miniflare": patch
"wrangler": patch
---

Fix service binding and tail consumer `props` being dropped between workers in different local dev instances

When a service binding or tail consumer configured with `props` targeted a worker running in a separate `wrangler dev` instance (via the dev registry), the `props` were silently dropped and the remote entrypoint saw an empty `ctx.props`. Props are now forwarded correctly across the dev registry boundary, matching the behavior users get when all workers run in a single instance.

```jsonc
// wrangler.json
{
	"services": [
		{
			"binding": "AUTH",
			"service": "auth-worker", // may be in a separate `wrangler dev` process
			"entrypoint": "SessionEntry",
			"props": { "tenant": "acme" },
		},
	],
}
```

The target worker's `SessionEntry` entrypoint now correctly receives `{ tenant: "acme" }` on `ctx.props` regardless of which local dev instance it runs in.
