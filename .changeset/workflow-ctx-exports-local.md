---
"miniflare": minor
"@cloudflare/workflows-shared": minor
"@cloudflare/vitest-plugin": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Support Workflows declared in `exports` on `ctx.exports` in local development

A Workflow declared in a Worker's `exports` is now available on `ctx.exports` in `wrangler dev`, the Vite plugin and the Vitest plugin, with the same API as a Workflow binding:

```ts
const instance = await ctx.exports.MyWorkflow.create({
	params: { name: "World" },
});
```

`ctx.exports` and `workflows` bindings with the same Workflow `name` share their instances, including instances created before the Workflow was declared in `exports`. Two Workers can't export the same Workflow name, and a binding to an exported Workflow must refer to the Worker and class that export it. `getPlatformProxy()` ignores Workflows declared in `exports`, since it doesn't run the Worker's code.

`wrangler workflows` commands run with `--local` also work with Workflows declared only in `exports`, without a `workflows` binding.

In the Vitest plugin, `introspectWorkflow()` and `introspectWorkflowInstance()` still need a Workflow binding, and now explain how to add one when passed a Workflow from `ctx.exports`. Instances created through `ctx.exports` are introspected too. A `workflows` binding whose `script_name` is the Worker's own name now resolves to the Worker itself again.
