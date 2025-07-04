---
"@cloudflare/vite-plugin": patch
---

Set the Wrangler peer dependency to the same version as the direct dependency. This fixes as issue where older versions of Wrangler could override the version used by the plugin.
