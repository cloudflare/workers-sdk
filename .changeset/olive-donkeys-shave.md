---
"@cloudflare/config": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add an `optional` option to `bindings.secret()` in `cloudflare.config.ts`

Secrets declared with `bindings.secret()` are inferred as `string` and enforced at deploy time. That is wrong for secrets that can legitimately be unset — a freshly created Worker has none set, and a rolled-back Worker can lose one — so there was no way to declare such a secret without lying to the type system.

Passing `{ optional: true }` infers the binding as `string | undefined` and excludes it from `secrets.required` in the generated Wrangler configuration, so deploying a Worker that does not have it set no longer fails:

```ts
import { bindings, defineWorker } from "wrangler/experimental-config";

export default defineWorker({
	name: "my-worker",
	env: {
		API_TOKEN: bindings.secret(), // string
		CF_ANALYTICS_API_TOKEN: bindings.secret({ optional: true }), // string | undefined
	},
});
```

Secrets remain required by default — `bindings.secret()` is unchanged.
