---
"miniflare": patch
---

add new `inspectorProxy` option to miniflare

add a new `inspectorProxy` option to miniflare that created a proxy that
connects inspector clients to the workerd inspector server (specifically to
the first user worker)

Example:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	inspectorProxy: true, // enable the inspector proxy
	inspectorPort: 9229, // set the inspector proxy to use port 9229
	workers: [
		{
			scriptPath: "./worker.js",
			modules: true,
			compatibilityDate: "2025-01-21",
		},
	],
});
```

Note: this proxy is used to only proxy a single user worker, the plan here is for
this to be iterated and make the proxy handle multiple workers (meaning that a single
inspector client could be used to debug multiple workers with a single connection
thanks to the proxy)

Note: this loosely follows what wrangler's `InspectorProxyWorker` currently does,
ideally in future iterations the worker should be removed and wrangler should
use this option instead
