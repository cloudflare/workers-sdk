---
"wrangler": minor
---

Add `modes` to `cloudflare.config.ts` for declarative per-environment config

This extends the experimental `--x-new-config` feature. Per-environment config was previously only expressible by branching on `ctx.mode` inside the function form of a config. That works at runtime, but it is opaque to `wrangler types`: the generated `Env` collapses every branch together, so bindings that only exist in one environment cannot be distinguished from ones that always exist.

`modes` declares those differences statically instead. Each entry is a partial Worker config layered over the base when that mode is selected with `--env` or `CLOUDFLARE_ENV`. `env` and `exports` merge per key so a mode only states what differs; every other field replaces the base value outright.

```ts
export default defineWorker({
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	env: { SHARED_KV: bindings.kv({ id: "..." }) },
	modes: {
		staging: { env: { API_KEY: bindings.secret() } },
		production: {
			name: "my-worker-prod",
			env: {
				API_KEY: bindings.secret(),
				ANALYTICS: bindings.r2({ name: "..." }),
			},
		},
	},
});
```

Because modes are declared rather than computed, `wrangler types` can now aggregate them the same way it does named environments in the Wrangler JSON config. A binding every mode declares is required on `Env`, one that only some declare is optional, and its type is the union of the types the declaring modes give it. Each mode's exact `Env` is also available as `Cloudflare.EnvFor<"production">`, with the declared names as `Cloudflare.Mode`.

Combined with ordinary `import` statements, this lets a large config be split across files while keeping a single aggregated `Env`. Branching on `ctx.mode` continues to work unchanged for configs that do not declare `modes`.
