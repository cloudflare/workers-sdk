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

Database clients such as `mysql2` and `pg` work unchanged, and `localConnectionString` is ignored when remote bindings are enabled. Database connections use credentials from the same remote session. When remote bindings are turned off, the binding uses its `localConnectionString` with a warning, or explains what to fix if there is none.

Remote Hyperdrive works in `wrangler dev` (single- and multi-worker), `getPlatformProxy()`, `@cloudflare/vite-plugin`, and `@cloudflare/vitest-plugin`. If one Hyperdrive binding fails to connect, other remote bindings remain available.

The `wrangler dev` binding table also reports a `remote: true` Hyperdrive binding as `remote` rather than always reporting `local`.

This is opt-in — bindings without `remote: true` keep the existing local-only behaviour and need no configuration changes.
