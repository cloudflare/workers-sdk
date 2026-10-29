---
"@cloudflare/vite-plugin": patch
---

Set the Build Output directories before other plugins read the resolved config

The plugin moves each environment's `build.outDir` into the Build Output directory while Vite resolves the config. It now does this before other plugins' `configResolved` hooks run, so frameworks that read the client output directory there, such as Nuxt's Vite builder, find their build output instead of the default `dist/client`.
