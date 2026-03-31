---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

Add `vpc_networks` binding support for routing Worker traffic through a Cloudflare Tunnel or network.

```jsonc
{
	"vpc_networks": [
		// Route through a specific Cloudflare Tunnel
		{ "binding": "MY_FIRST_VPC", "tunnel_id": "<tunnel-id>" },
		// Route through the Cloudflare One mesh network
		{ "binding": "MY_SECOND_VPC", "network_id": "cf1:network" },
	],
}
```
