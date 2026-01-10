---
"@cloudflare/vite-plugin": patch
---

Apply `vite-plugin-cloudflare:nodejs-compat-warnings` plugin only to relevant environments.

This is an optimisation so that it doesn't run for the `client` environment or Worker environments that have the `nodejs_compat` compatibility flag enabled.
