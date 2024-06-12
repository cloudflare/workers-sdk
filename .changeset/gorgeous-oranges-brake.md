---
"wrangler": patch
---

fix: Fix `pages dev` watch mode [Functions]

The watch mode in `pages dev` for Pages Functions projects is currently partially broken, as it only watches for file system changes in the
"/functions" directory, but not for changes in any of the Functions' dependencies. This means that given a Pages Function `math-is-fun.ts`, defined as follows:

```
import { ADD } from "../math/add";

export async function onRequest() {
	return new Response(`${ADD} is fun!`);
}
```

`pages dev` will reload for any changes in `math-is-fun.ts` itself, but not for any changes in `math/add.ts`, which is its dependency.

Similarly, `pages dev` will not reload for any changes in non-JS module imports, such as wasm/html/binary module imports.

This commit fixes all these things, plus adds some extra polish to the `pages dev` watch mode experience.
