---
"@cloudflare/workers-utils": patch
"@cloudflare/workers-auth": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/kv-asset-handler": patch
"@cloudflare/autoconfig": patch
"@cloudflare/containers-shared": patch
"@cloudflare/codemods": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Fix `Dynamic require` errors when importing packages from ES modules

Importing these packages in a Node.js ES module could fail with `Dynamic require of "..." is not supported` when a dependency loaded a Node.js built-in. These imports now work without requiring a CommonJS wrapper.
