---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

Add support for customising the inspector IP address

Adds a new `--inspector-ip` CLI flag and `dev.inspector_ip` configuration option to allow customising the IP address that the inspector server listens on. Previously, the inspector was hardcoded to listen only on `127.0.0.1`.

Example usage:

```bash
# CLI flag
wrangler dev --inspector-ip 0.0.0.0
```

```jsonc
// wrangler.json
{
	"dev": {
		"inspector_ip": "0.0.0.0",
	},
}
```
