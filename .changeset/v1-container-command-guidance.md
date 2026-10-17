---
"@cloudflare/vite-plugin": patch
---

Pass Container command guidance directly to shared helpers

Keep local development and preview guidance aligned with the CLI and each Worker's configuration file, including legacy Wrangler configurations and the experimental cf delegate. Use the matching Container and deployment helper releases without relying on global command presentation state.
