---
"@cloudflare/vite-plugin": patch
---

Fix a bug where Node.js externals (i.e. Node.js imports that are included in the runtime) were being registered as missing imports with the `depsOptimizer`. This was previously causing the dev server to crash if these imports were encountered when using React Router.
