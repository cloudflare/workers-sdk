---
"wrangler": patch
---

fix: make sure `getPlatformProxy`'s `ctx` method throw illegal invocation errors like workerd

in workerd detaching the `waitUntil` and `passThroughOnException` methods from the `ExecutionContext`
object results in them throwing `illegal invocation` errors, such as for example:

```js
export default {
	async fetch(_request, _env, { waitUntil }) {
		waitUntil(() => {}); // <-- throws an illegal invocation error
		return new Response("Hello World!");
	},
};
```

make sure that the same behavior is applied to the `ctx` object returned by `getPlatformProxy`
