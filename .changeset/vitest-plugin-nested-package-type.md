---
"@cloudflare/vitest-plugin": patch
---

Fix CommonJS dependencies being loaded as ES modules under Vitest 5 inline projects

A dependency with its own `"type": "commonjs"` `package.json` was treated as an ES module when an earlier `.js` file elsewhere in the project had been classified by the project's `"type": "module"` `package.json`. The dependency then failed at import with errors such as `Cannot set properties of undefined` or `exports is not defined`. The nearest `package.json` now always decides how a `.js` file is loaded.
