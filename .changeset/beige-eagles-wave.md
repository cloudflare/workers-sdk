---
"wrangler": minor
"no-bundle-import": patch
---

feature: Support modules with `--no-bundle`

When the `--no-bundle` flag is set, Wrangler now has support for uploading additional modules alongside the entrypoint. This will allow modules to be imported at runtime on Cloudflare's Edge. This respects Wrangler's [module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) configuration, which means that only imports of non-JS modules will trigger an upload by default. For instance, the following code will now work with `--no-bundle` (assuming the `example.wasm` file exists at the correct path):

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

For JS modules, it's necessary to specify an additional [module rule](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) (or rules) in you `wrangler.toml` to configure whether your modules are ES modules or Common JS modules. For instance, to upload an additional module called `dep.js` which is an ES module, add the following module rule to your `wrangler.toml`, which tells Wrangler that all `**/*.js` files are ES modules.

```toml
rules = [
  { type = "ESModule", globs = ["**/*.js"]},
]
```

If you have Common JS modules, you'd configure Wrangler with a CommonJS rule (the following rule tells Wrangler that all `.cjs` files are CommonJS):

```toml
rules = [
  { type = "CommonJS", globs = ["**/*.cjs"]},
]
```
