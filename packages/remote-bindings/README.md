# `@cloudflare/remote-bindings`

Establishes a local proxy to bindings hosted by Cloudflare. This package is a
prerelease internal API and may change without notice.

```ts
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";

const result = await maybeStartOrUpdateRemoteProxySession({
	name: "my-worker",
	bindings: {
		KV: { type: "kv_namespace", id: "namespace-id", remote: true },
	},
});

await result?.session.dispose();
```
