---
"wrangler": minor
---

feature: add a `ctx` field to the `getBindingsProxy` result

Add a new `ctx` filed to the `getBindingsProxy` result that people can use to mock the production
`ExecutionContext` object.

Example:

```ts
const { ctx } = await getBindingsProxy();
// ...
ctx.waitUntil(myPromise);
```
