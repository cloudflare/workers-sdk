---
"@cloudflare/autoconfig": patch
---

Write a new Vite config that Vite can load in a package that isn't an ES module

When a project has no Vite config, autoconfig creates one. In a package without `"type": "module"`, it is now `vite.config.mts` or `vite.config.mjs`, because Vite loads `vite.config.ts` or `vite.config.js` there as CommonJS, which can't import the ESM-only Cloudflare Vite plugin.
