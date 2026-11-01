---
"miniflare": minor
"@cloudflare/deploy-helpers": patch
---

Expose Miniflare utilities without loading the Workers runtime

Add `miniflare/node-compat` and `miniflare/sourcemap` entry points for compatibility checks and source-map support. Use them in deploy-helpers so importing deployment utilities no longer requires the platform workerd binary. Startup profiling continues to load the runtime on demand.
