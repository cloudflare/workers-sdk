---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": patch
---

Share compatibility and source-map helpers without loading the Workers runtime

Move `getNodeCompat`, `NodeJSCompatMode`, and `getFreshSourceMapSupport` into workers-utils, with `/node-compat` and `/sourcemap` entry points. Import the shared helpers directly in deploy-helpers so deployment utilities no longer resolve the platform workerd binary. Startup profiling continues to load the runtime on demand.
