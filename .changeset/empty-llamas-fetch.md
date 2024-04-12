---
"@cloudflare/vitest-pool-workers": patch
---

fix: Support importing ES modules from libraries that do not correctly provide `"type"="module"` not use `.mjs` extensions

The toucan-js library has an entry point of `"module": "dist/index.esm.js"`. This file does not use the standard `.mjs` extension, nor does it specify `"type"="module"`, so the resolution and loading algorithm fails to identify this file as an ES Module, defaulting to CommonJS, breaking Vitest.
Fixes #5588
