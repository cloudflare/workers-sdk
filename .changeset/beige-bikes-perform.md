---
"wrangler": patch
---

Add wasm support in `wrangler pages publish`

Currently it is not possible to import `wasm` modules in either Pages
Functions or Pages Advanced Mode projects.

This commit caries out work to address the aforementioned issue by
enabling `wasm` module imports in `wrangler pages publish`. As a result,
Pages users can now import their `wasm` modules withing their Functions
or `_worker.js` files, and `wrangler pages publish` will correctly
bundle everything and serve these "external" modules.
