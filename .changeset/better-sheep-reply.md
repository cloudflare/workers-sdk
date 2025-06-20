---
"wrangler": patch
---

add remote bindings support to `getPlatformProxy`

Example:

```json
// wrangler.jsonc
{
	"name": "get-platform-proxy-test",
	"services": [
		{
			"binding": "MY_WORKER",
			"service": "my-worker",
			"experimental_remote": true
		}
	]
}
```

```js
// index.mjs
import { getPlatformProxy } from "wrangler";

const { env } = await getPlatformProxy({
	experimental: {
		remoteBindings: true,
	},
});

// env.MY_WORKER.fetch() fetches from the remote my-worker service
```
