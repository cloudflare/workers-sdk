---
"wrangler": patch
---

feat: resolve imports in a more node-like fashion, greatly increasing developer experience.

Previously, trying to import a file that wasn't explicitly exported from a module would result in an error, but now, better attempts are made to resolve the import using node's module resolution algorithm. It's now possible to do things like this:

```js
import JPEG_DEC_WASM from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
```

This works even if the `mozjpeg_dec.wasm` file isn't explicitly exported from the `@jsquash/jpeg` module.
