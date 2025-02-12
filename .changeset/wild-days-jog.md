---
"@cloudflare/vite-plugin": patch
---

fix node.js compat module resolution

The polyfills that get compiled into the Worker were not being found
because they were dependencies of the plugin, not the user's project.

This fixes how these id are resolved in the plugin to be able to find them
in npm, pnpm and yarn.
