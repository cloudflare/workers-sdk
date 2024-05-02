---
"@cloudflare/vitest-pool-workers": patch
---

fix[vitest-pool-workers]: Allow cjs to import index.js using directory path

`maybeGetTargetFilePath` did not correctly deal with implicit import of
index.js files.

If target is a directory, we need to check if it has an index
(js, mjs, cjs) file and return that file path if present.
