---
"wrangler": patch
---

You can now import Wasm modules in Pages Functions and Pages Functions Advanced Mode (`_worker.js`).
This change specifically enables `wasm` module imports in `wrangler pages functions build`.
As a result, Pages users can now import their `wasm` modules within their Functions or
`_worker.js` files, and `wrangler pages functions build` will correctly bundle everything
and output the expected result file.
