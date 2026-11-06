---
"@cloudflare/vite-plugin": patch
---

Set the Build Output directories before other plugins read the resolved config

Plugins that read an environment's `build.outDir` in their `configResolved` hook now see the Build Output directory, instead of the directory from before the Cloudflare plugin moved it.
