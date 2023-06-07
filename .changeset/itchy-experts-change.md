---
"wrangler": patch
---

fix: in D1, lift error.cause into the error message

Prior to this PR, folks _had_ to console.log the `error.cause` property to understand why their D1 operations were failing. With this PR, `error.cause` will continue to work, but we'll also lift the cause into the error message.
