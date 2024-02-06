---
"wrangler": minor
---

feature: add a `cf` field to the `getBindingsProxy` result

Add a new `cf` field to the `getBindingsProxy` result that people can use to mock the production
`cf` (`IncomingRequestCfProperties`) object.

Example:

```ts
const { cf } = await getBindingsProxy();

console.log(`country = ${cf.country}; colo = ${cf.colo}`); // logs 'country = GB ; colo = LHR'
```
