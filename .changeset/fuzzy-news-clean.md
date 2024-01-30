---
"miniflare": minor
---

feature: implemented basic Python support

Here is an example showing how to construct a MiniFlare instance with a Python module:

```js
const mf = new Miniflare({
	modules: [
		{
			type: "PythonModule",
			path: "index",
			contents:
				"from js import Response;\ndef fetch(request):\n  return Response.new('hello')",
		},
	],
	compatibilityFlags: ["experimental"],
});
```
