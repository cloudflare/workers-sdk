---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/containers-shared": patch
---

Configure SSH for experimental Durable Object-managed Containers

Set `containers[].ssh` and `containers[].authorized_keys` when using `scheduling_policy: "durable_object"`. These are application-wide settings that follow the same rules as the existing Durable Object-managed Container settings: normal deployments create missing applications and update explicitly configured values, while omitted settings preserve the existing application configuration.

```jsonc
// wrangler.jsonc
{
	"containers": [
		{
			"name": "sandbox",
			"class_name": "Sandbox",
			"scheduling_policy": "durable_object",
			"ssh": { "enabled": true },
			"authorized_keys": [
				{ "name": "laptop", "public_key": "ssh-ed25519 AAAA..." },
			],
		},
	],
}
```
