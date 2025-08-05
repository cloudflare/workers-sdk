---
"wrangler": patch
---

fix `startWorker` not respecting `auth` options for remote bindings

fix `startWorker` currently not taking into account the `auth` field
that can be provided as part of the `dev` options when used in conjunction
with remote bindings

example:

Given the following

```js
import { unstable_startWorker } from "wrangler";

const worker = await unstable_startWorker({
	entrypoint: "./worker.js",
	bindings: {
		AI: {
			type: "ai",
			experimental_remote: true,
		},
	},
	dev: {
		experimentalRemoteBindings: true,
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

`wrangler` will now use the provided `<ACCOUNT_ID>` and `<API_TOKEN>` to integrate with
the remote AI binding instead of requiring the user to authenticate.
