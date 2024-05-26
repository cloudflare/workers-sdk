---
"miniflare": patch
---

fix: Allow the magic proxy to handle functions returning functions

Previously functions returning functions would not be handled by the magic proxy,
the changes here enable the above, allowing for code such as the following:

```js
	const mf = new Miniflare(/* ... */);

	const { functionsFactory } = await mf.getBindings<Env>();
	const fn = functionsFactory.getFunction();
	const functionResult = fn();
```

This also works with the native workers RPC mechanism, allowing users to
return functions in their RPC code.
