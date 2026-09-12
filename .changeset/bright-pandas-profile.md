---
"@cloudflare/deploy-helpers": minor
---

Share Worker startup profiling with other Cloudflare developer tools

Move the bundle analyser out of Wrangler so `cf` and deploy failure diagnostics can use the same Miniflare CPU profiler.
