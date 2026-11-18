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

Build with tsdown so the ESM output can be loaded in a pure-ESM context

Previously, bundled CommonJS dependencies could cause `Dynamic require of "..." is not supported` errors when these packages were loaded as ESM. Build the remaining tsup packages with tsdown and provide Node.js shims for their Node.js entry points. Keep the browser and Worker metrics entry points free of Node.js built-ins.
