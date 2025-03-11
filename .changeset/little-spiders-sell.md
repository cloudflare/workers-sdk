---
"miniflare": minor
---

feat: add new `unsafeInspectorProxy` option to miniflare

Add a new `unsafeInspectorProxy` option to the miniflare worker options, if
at least one worker has the option set then miniflare will establish a proxy
between itself and workerd for the v8 inspector APIs which exposes only the
requested workers to inspector clients. The inspector proxy communicates through
miniflare's `inspectorPort` and exposes each requested worker via a path comprised
of the worker's name

example:

```js
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	// the inspector proxy will be accessible through port 9229
	inspectorPort: 9229,
	workers: [
		{
			name: "worker-a",
			scriptPath: "./worker-a.js",
			// enable the inspector proxy for worker-a
			unsafeInspectorProxy: true,
		},
		{
			name: "worker-b",
			scriptPath: "./worker-b.js",
			// worker-b is not going to be proxied
		},
		{
			name: "worker-c",
			scriptPath: "./worker-c.js",
			// enable the inspector proxy for worker-c
			unsafeInspectorProxy: true,
		},
	],
});
```

In the above example an inspector proxy gets set up which exposes `worker-a` and `worker-b`,
inspector clients can discover such workers via `http://localhost:9229` and communicate with
them respectively via `ws://localhost:9229/worker-a` and `ws://localhost:9229/worker-b`

Note: this API is experimental, thus it's not being added to the public documentation and
it's prefixed by `unsafe`
