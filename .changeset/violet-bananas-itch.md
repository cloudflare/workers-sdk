---
"wrangler": patch
---

fix `startWorker` not respecting `auth` options

fix `startWorker` currently not taking into account the `auth` field
that can be provided as part of the `dev` options

example:

Given the following

```js
import { unstable_startWorker } from "wrangler";

const worker = await unstable_startWorker({
	entrypoint: "./worker.js",
	bindings: {
		AI: {
			type: "ai",
		},
	},
	dev: {
		auth: {
			accountId: "<ACCOUNT_ID>",
			apiToken: {
				apiToken: "<API_TOKEN>",
			},
		},
	},
});

await worker.ready;
```

`wrangler` will use the provided `<ACCOUNT_ID>` and `<API_TOKEN>` to integrate with
the remote AI binding instead of requiring the user to authenticate.
