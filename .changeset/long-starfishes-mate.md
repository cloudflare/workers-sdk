---
"wrangler": patch
---

feat: resolve npm exports for file imports

Previously, when using wasm (or other static files) from an npm package, you would have to import the file like so:

```js
import wasm from "../../node_modules/svg2png-wasm/svg2png_wasm_bg.wasm";
```

This update now allows you to import the file like so, assuming it's exposed and available in the package's `exports` field:

```js
import wasm from "svg2png-wasm/svg2png_wasm_bg.wasm";
```

This will look at the package's `exports` field in `package.json` and resolve the file using [`resolve.exports`](https://www.npmjs.com/package/resolve.exports).
