---
"@cloudflare/config": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
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

Miniflare stands up a local TCP bridge and points the binding's designator at it, so database clients such as `mysql2` and `pg` work unchanged. A shared RPC session owns both the edge credentials and each independent database connection, keeping queries on the Worker instance that issued the credentials. This makes `localConnectionString` optional when remote bindings are enabled. Without a remote proxy session — for example when running with remote bindings turned off — the binding falls back to its `localConnectionString` with a warning, or explains what to fix if there is none.

Credentials and connections are managed in Miniflare, shared by `wrangler dev` (single- and multi-worker), `getPlatformProxy()`, `@cloudflare/vite-plugin`, and `@cloudflare/vitest-plugin`. Consumers only need to provide the remote proxy session URL. A failing Hyperdrive binding does not discard other bindings' credentials.

The `wrangler dev` binding table also reports a `remote: true` Hyperdrive binding as `remote` rather than always reporting `local`.

This is opt-in — bindings without `remote: true` keep the existing local-only behaviour and need no configuration changes.
