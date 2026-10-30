---
"@cloudflare/vite-plugin": patch
---

Set the Build Output directories while Vite resolves the config

The plugin used to move each environment's `build.outDir` into the Build Output directory after Vite had resolved the config. It now sets them in a `configEnvironment` hook, so other plugins read the Build Output directories from the resolved config. Frameworks that read the client output directory in their own `configResolved` hook, such as Nuxt's Vite builder, now find their build output.
