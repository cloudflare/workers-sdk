---
"wrangler": minor
---

Allow `text_blobs` in ES module workers

`text_blobs` previously errored on ES module workers, with the recommendation to `import` the file directly. That does not cover the case of binding a different file per environment to the same bundle at deploy time, for example, binding an environment-specific config blob without building a separate artifact per environment.

`data_blobs` and `wasm_modules` keep their existing ESM restrictions.
