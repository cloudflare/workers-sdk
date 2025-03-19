---
"@cloudflare/vite-plugin": patch
---

Support Text and Data module types.
Text modules can be imported with a `.txt` or `.html` extension while Data modules can be imported with a `.bin` extension.
This expands on the existing support for WebAssembly modules, which can now be imported with `.wasm` or `.wasm?module` extensions.
Custom rules are not supported.
More info on including non-JavaScript modules can be found [here](https://developers.cloudflare.com/workers/wrangler/bundling/#including-non-javascript-modules).
