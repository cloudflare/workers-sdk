---
"wrangler": patch
---

feat: Add support for wasm module imports in `wrangler pages dev`

Currently it is not possible to import `wasm` modules in either Pages
Functions or Pages Advanced Mode projects.

This commit caries out work to address the aforementioned issue by
enabling `wasm` module imports in `wrangler pages dev`. As a result,
Pages users can now import their `wasm` modules withing their Functions
or `_worker.js` files, and `wrangler pages dev` will correctly bundle
everything and serve these "external" modules.

```
import hello from "./hello.wasm"

export async function onRequest() {
	const module = await WebAssembly.instantiate(hello);
	return new Response(module.exports.hello);
}
```
