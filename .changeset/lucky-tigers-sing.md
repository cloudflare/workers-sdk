---
"@cloudflare/autoconfig": patch
---

Install `@cloudflare/vite-plugin@^2.0.0-beta.v.0` when autoconfiguring projects for cf

Use a version range instead of the `beta` dist-tag for the experimental cf target. Wrangler autoconfiguration continues to install the latest stable release.
