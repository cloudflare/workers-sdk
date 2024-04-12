---
"wrangler": minor
---

feat: add support for environments in `getPlatformProxy`

allow `getPlatformProxy` to target environments by allowing users to specify an `env` option

Example usage:

```js
const { env } = await getPlatformProxy({
	env: "production",
});
```
