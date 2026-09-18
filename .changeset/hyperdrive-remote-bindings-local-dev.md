---
"miniflare": minor
"wrangler": minor
---

Support remote Hyperdrive bindings in local development

Hyperdrive bindings were local-only in `wrangler dev`, so exercising the database behind a deployed Hyperdrive configuration meant running `wrangler dev --remote` or standing up a local copy of the database. Setting `remote: true` on a `hyperdrive` binding now connects local dev to the deployed configuration instead:

```jsonc
{
	"hyperdrive": [
		{
			"binding": "HYPERDRIVE",
			"id": "<your-hyperdrive-id>",
			// connect to the deployed Hyperdrive configuration in `wrangler dev`
			"remote": true,
		},
	],
}
```

Miniflare stands up a local TCP bridge and points the binding's designator at it, relaying each connection to the edge Hyperdrive binding over the existing remote bindings proxy, so database clients such as `mysql2` and `pg` work unchanged. The edge session mints per-session credentials, so its connection string is fetched once per session and handed to the local binding — that is what lets a driver authenticate through the proxy, and it makes `localConnectionString` optional whenever the session can be established. When it cannot — you are logged out, offline, or running with remote bindings turned off — the binding falls back to its `localConnectionString` with a warning, or explains what to fix if there is none.

Credentials are seeded in `wrangler dev` (single- and multi-worker) and `getPlatformProxy()`. `unstable_getMiniflareWorkerOptions()` is synchronous and so cannot fetch them; a `remote: true` Hyperdrive binding used through it — for example under `@cloudflare/vite-plugin` or `@cloudflare/vitest-pool-workers` — warns that connections will likely fail to authenticate rather than failing silently.

The `wrangler dev` binding table also reports a `remote: true` Hyperdrive binding as `remote` rather than always reporting `local`.

This is opt-in — bindings without `remote: true` keep the existing local-only behaviour and need no configuration changes.
