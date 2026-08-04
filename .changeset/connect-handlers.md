---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
"@cloudflare/config": minor
---

Add `connect` trigger for raw sockets

You can now configure a Worker to receive raw socket connections during `wrangler dev`, delivered directly to the Worker's `connect(socket, env, ctx)` handler:

```jsonc
{
	"connect": [{ "protocol": "tcp", "port": 5432 }],
}
```

Each entry opens a listening socket on `127.0.0.1` (or the given `address`) that forwards incoming connections straight to the Worker, bypassing the local dev HTTP entry point. This requires the `experimental` compatibility flag. Only `"tcp"` is currently supported locally; `"udp"` is accepted by the schema for forward compatibility but will fail to start until workerd adds support for it.

`@cloudflare/config` also supports declaring this trigger via `triggers.connect(...)`, which lowers to the `connect` field above:

```ts
import { defineWorker, triggers } from "@cloudflare/config";

export default defineWorker({
  triggers: [triggers.connect({ protocol: "tcp", port: 5432, address: "127.0.0.1" })],
});
```
