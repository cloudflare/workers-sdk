---
"@cloudflare/vite-plugin": minor
---

Allow `optimizeDeps.exclude` to be specified for Worker environments. This enables other plugins to exclude dependencies from optimization that require access to virtual modules. Note that excluded dependencies must be ESM.
