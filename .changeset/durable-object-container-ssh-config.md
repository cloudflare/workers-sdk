---
"@cloudflare/config": minor
"wrangler": minor
---

Support SSH settings for Durable Object-managed Containers in the configuration API

`defineContainer` now accepts `ssh` and `authorizedKeys` with `schedulingPolicy: "durable-object"`, matching the `ssh` and `authorized_keys` fields that Wrangler already supports for these Containers. Previously the schema rejected them, so they could not be set from `cloudflare.config.ts`.

```ts
defineContainer({
	name: "sandbox",
	schedulingPolicy: "durable-object",
	ssh: { enabled: true },
	authorizedKeys: [{ name: "laptop", publicKey: "ssh-ed25519 AAAA..." }],
});
```
