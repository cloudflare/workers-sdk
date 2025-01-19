---
"wrangler": patch
---

add support for assets bindings to `getPlatformProxy`

this change makes sure that that `getPlatformProxy`, when the input configuration
file contains an assets field, correctly returns the appropriate asset binding proxy

example:

```json
// wrangler.json
{
	"name": "my-worker",
	"assets": {
		"directory": "./public/",
		"binding": "ASSETS"
	},
	"vars": {
		"MY_VAR": "my-var"
	}
}
```

```js
import { getPlatformProxy } from "wrangler";

const { env } = await getPlatformProxy();

if (env.ASSETS) {
	const text = await (
		await p.env.ASSETS.fetch("http://0.0.0.0/file.txt")
	).text();
	console.log(text); // logs the content of file.txt
}

p.dispose();
```
