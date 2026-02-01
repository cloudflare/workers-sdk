---
"@cloudflare/eslint-config-shared": patch
---

Add an ESLint rule checking that `expect` is not imported from `vitest`.

Retrieving `expect` from the test context is safer for concurrent tests,
so we will standardize on using that.
