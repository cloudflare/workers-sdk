---
"wrangler": minor
---

Add types to DurableObjectNamespace type generation. For example:

```ts
interface Env {
	OBJECT: DurableObjectNamespace<import("./src/index").MyDurableObject>;
}
```
