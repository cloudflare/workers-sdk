---
"miniflare": minor
"wrangler": minor
---

Support remote Hyperdrive bindings in local development

Set `remote: true` on a Hyperdrive binding in `wrangler.json` to connect local development to its deployed configuration instead of a local database. Wrangler, `getPlatformProxy()`, the Cloudflare Vite plugin, and the Vitest plugin prepare the remote credentials before creating the local bindings. Bindings without `remote: true` keep their existing local-only behavior.

```jsonc
{
	"hyperdrive": [
		{
			"binding": "HYPERDRIVE",
			"id": "<your-hyperdrive-id>",
			"remote": true,
		},
	],
}
```

Remote Hyperdrive setup fails if the required edge credentials cannot be fetched after bounded retries. Check your authentication and internet connection, then retry. A local connection string cannot replace missing credentials when using the remote transport. Connections close before sending database traffic if the edge reports credentials that do not match the local binding; this detects a mismatch but does not guarantee that separate connections reach the same edge instance. Direct Miniflare remote configurations must also supply valid edge credentials.
