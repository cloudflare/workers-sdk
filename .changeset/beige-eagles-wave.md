---
"wrangler": minor
"no-bundle-import": patch
---

feature: Support modules with `--no-bundle`

When the `--no-bundle` flag is set, Wrangler now has support for traversing the module graph with `esbuild`, to figure out what additional modules should be uploaded alongside the entrypoint. This will allow modules to be imported at runtime on Cloudflare's Edge. This also respects Wrangler's [module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) configuration, which means that importing non-JS modules will also trigger an upload. For instance, the following code will now work with `--no-bundle` (assuming the `example.wasm` file exists at the correct path):

```js
// index.js
import wasm from './example.wasm'

export default {
  async fetch() {
    await WebAssembly.instantiate(wasm, ...)
    ...
  }
}
```
