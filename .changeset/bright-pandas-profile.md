---
"@cloudflare/deploy-helpers": minor
---

Share Worker startup profiling with other Cloudflare developer tools

Move the bundle analyser out of Wrangler so `cf` and deploy failure diagnostics can use the same Miniflare CPU profiler. The `analyseBundle` callback on `DeployCallbacks` is now optional and deprecated, and will be removed in a future release once all clients have been updated to stop passing this property.
