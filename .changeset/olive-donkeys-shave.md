---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add an `optional` option to `bindings.secret()` and a `secrets.optional` field to the Wrangler configuration

Secrets declared with `bindings.secret()` are inferred as `string` and enforced at deploy time. That is wrong for secrets that can legitimately be unset — a freshly created Worker has none set, and a rolled-back Worker can lose one — so there was no way to declare such a secret without lying to the type system.

Passing `{ optional: true }` infers the binding as `string | undefined` and emits it as `secrets.optional` rather than `secrets.required`:

```ts
import { bindings, defineWorker } from "wrangler/experimental-config";

export default defineWorker({
	name: "my-worker",
	env: {
		API_TOKEN: bindings.secret(), // string
		SENTRY_TOKEN: bindings.secret({ optional: true }), // string | undefined
	},
});
```

The equivalent field is also available directly in `wrangler.json`:

```json
{
	"secrets": {
		"required": ["API_TOKEN"],
		"optional": ["SENTRY_TOKEN"]
	}
}
```

Optional secrets are still loaded from `.dev.vars`/`.env`/`process.env` in local dev and are emitted by `wrangler types` as `string | undefined`, but no "Missing required secrets" warning is logged when they are absent and deploying a Worker that does not have them set no longer fails.

Secrets remain required by default — `bindings.secret()` is unchanged.
