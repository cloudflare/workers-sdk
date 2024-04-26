---
"wrangler": minor
---

feat: add support for environments in `getPlatformProxy`

allow `getPlatformProxy` to target environments by allowing users to specify an `environment` option

Example usage:

```js
const { env } = await getPlatformProxy({
	environment: "production",
});
```
