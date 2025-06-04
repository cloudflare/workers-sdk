---
"wrangler": patch
---

add `experimentalMixedMode` dev option to `unstable_startWorker`

add an new `experimentalMixedMode` dev option to `unstable_startWorker`
that allows developers to programmatically start a new mixed mode
session using startWorker.

Example usage:

```js
// index.mjs
import { unstable_startWorker } from "wrangler";

await unstable_startWorker({
	dev: {
		experimentalMixedMode: true,
	},
});
```

```json
// wrangler.jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "programmatic-start-worker-example",
	"main": "src/index.ts",
	"compatibility_date": "2025-06-01",
	"services": [
		{ "binding": "REMOTE_WORKER", "service": "remote-worker", "remote": true }
	]
}
```
