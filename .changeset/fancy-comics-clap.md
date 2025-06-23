---
"wrangler": minor
---

Add params type to Workflow type generation. E.g.

```ts
interface Env {
	MY_WORKFLOW: Workflow<
		Parameters<import("./src/index").MyWorkflow["run"]>[0]["payload"]
	>;
}
```
