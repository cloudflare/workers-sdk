---
"wrangler": minor
---

Add types to DurableObjectNamespace type generation. For example:

```ts
interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace<import("./src/index").MyDurableObject>;
}
```
