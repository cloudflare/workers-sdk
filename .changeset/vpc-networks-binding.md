---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

Add `vpc_networks` binding type and `wrangler vpc network` CLI commands

Workers can now bind to an entire Cloudflare Tunnel or an explicitly created VPC network using the new `vpc_networks` configuration field. At runtime, `env.MY_VPC.fetch("http://any-internal-host/")` routes requests through the tunnel without requiring per-target registration.

Example `wrangler.json` configuration:

```jsonc
{
	"vpc_networks": [
		// Simple case: bind directly to a tunnel
		{ "binding": "MY_VPC", "tunnel_id": "your-tunnel-uuid" },
		// Custom DNS: bind to an explicitly created network
		{ "binding": "MY_DNS_VPC", "network_id": "your-network-uuid" },
	],
}
```

New CLI commands for managing VPC networks:

- `wrangler vpc network create <name>` — create a network with `--tunnel-id` and optional `--resolver-ips`
- `wrangler vpc network list` — list all VPC networks
- `wrangler vpc network get <network-id>` — get network details
- `wrangler vpc network update <network-id>` — update a network
- `wrangler vpc network delete <network-id>` — delete a network

Each binding generates a `Fetcher` type for TypeScript type generation. Like `vpc_services`, VPC network bindings are always remote in `wrangler dev`.
