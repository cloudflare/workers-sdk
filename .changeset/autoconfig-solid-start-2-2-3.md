---
"@cloudflare/autoconfig": minor
---

Require SolidStart 2.2.3 or later on `cf`

SolidStart 2.2.3 keeps `@solidjs/start` out of server pre-bundling itself, so autoconfig no longer adds `environments.ssr.optimizeDeps.exclude` to the Vite config to make server functions work in dev.
