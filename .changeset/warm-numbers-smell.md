---
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
---

Bundle the `zod` dependency to reduce supply chain attack surface

In order to prevent possible npm vulnerability attacks, the team's policy is to bundle
dependencies in our packages where possible. This helps ensure that only trusted code
runs on the user's system, even if compromised packages are later published to npm.

This change bundles `zod` (a pure JavaScript validation library with no native dependencies)
into miniflare and @cloudflare/vitest-pool-workers.

Other dependencies remain external for technical reasons:

- `sharp`: Native binary with platform-specific builds
- `undici`: Dynamically required at runtime in worker threads
- `ws`: Has optional native bindings for performance
- `workerd`: Native binary (Cloudflare's JavaScript runtime)
- `@cspotcode/source-map-support`: Uses require.cache manipulation at runtime
- `youch`: Dynamically required for lazy loading
