---
"@cloudflare/vitest-pool-workers": patch
---

Stop one `.js` file's ESM/CommonJS classification leaking to every other file in the same package

The module fallback service decides whether a `.js` file is an ES module from its nearest `package.json`, treating it as ESM when `"type": "module"` **or** when the file is that package's `"module"` entry point. That second check depends on the file, but its result was cached per directory, so the first `.js` file resolved out of a package decided the classification handed to `workerd` for every other file in it.

For a dual-format package (`"main": "dist/index.cjs.js"`, `"module": "dist/index.esm.js"`, no `"type"`), whichever file was resolved first won: load the ES module build first and the CommonJS build is subsequently sent to `workerd` as an `esModule`, and vice versa. Which of the two happened depended on import order, so it could differ between runs.

Only `"type"` is cached per directory now; the `"module"` entry-point comparison runs per file.
