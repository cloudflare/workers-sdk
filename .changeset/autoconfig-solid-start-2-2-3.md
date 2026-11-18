---
"@cloudflare/autoconfig": patch
---

Stop adding the SolidStart pre-bundling exclude on `cf` for SolidStart 2.2.3 and later

SolidStart 2.2.3 keeps `@solidjs/start` out of server pre-bundling itself, so autoconfig now adds `environments.ssr.optimizeDeps.exclude` to the Vite config only for earlier 2.x versions.
