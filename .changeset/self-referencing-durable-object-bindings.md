---
"@cloudflare/config": minor
"miniflare": patch
---

Make `worker` optional on Durable Object bindings in `cloudflare.config.ts`

A Durable Object binding without `worker` now refers to a class exported by the Worker being configured, matching a `wrangler.jsonc` binding without `script_name`:

```ts
env: {
	COUNTER: bindings.durableObject({ exportName: "Counter" }),
}
```

Previously `worker` was required, so a Worker binding its own class had to name itself. That name became `script_name`, which always refers to a named script: a Worker Preview bound to the parent Worker's production namespace instead of its own, and `wrangler dev` rejected a Container on that Durable Object. An explicit `worker` keeps its literal meaning. The binding is typed from the Worker's own entrypoint, the Build Output Specification accepts it, and Miniflare resolves it to the current Worker. The dormant Workflow binding types follow the same rule.
