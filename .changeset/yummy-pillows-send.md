---
"miniflare": minor
---

Add support for Node.js style custom handlers for service bindings and outbound services. This makes it easier to integrate Miniflare with existing Node.js middleware and libraries as `req` and `res` objects can be used directly.

```js
new Miniflare({
	serviceBindings: {
		CUSTOM: {
			node: (req, res) => {
				res.end(`Hello world`);
			},
		},
	},
});
```
