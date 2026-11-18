---
"miniflare": minor
---

Add `unsafeIntrospectWorkflow()` and `unsafeIntrospectWorkflowInstance()` for exported Workflows

They find a Workflow by its Worker's name and its class name, so code running in Node.js can introspect a Workflow on `ctx.exports` that has no `env` binding:

```ts
const introspector = await mf.unsafeIntrospectWorkflow(
	"my-worker",
	"MyWorkflow"
);
```
