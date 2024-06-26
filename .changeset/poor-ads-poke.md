---
"wrangler": patch
---

fix: Fix `pages dev` watch mode [_worker.js]

The watch mode in `pages dev` for Advanced Mode projects is currently partially broken, as it only watches for changes in the "\_worker.js" file, but not for changes in any of its imported dependencies. This means that given the following "\_worker.js" file

```
import { graham } from "./graham-the-dog";
export default {
	fetch(request, env) {
		return new Response(graham)
	}
}
```

`pages dev` will reload for any changes in the `_worker.js` file itself, but not for any changes in `graham-the-dog.js`, which is its dependency.

Similarly, `pages dev` will not reload for any changes in non-JS module imports, such as wasm/html/binary module imports.

This commit fixes all the aforementioned issues.
