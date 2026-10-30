---
"@cloudflare/vite-plugin": patch
---

Show the Build Output directories to other plugins while Vite resolves the config

Plugins that read an environment's `build.outDir` in their `configResolved` hook could see the directory from before it was moved into the Build Output directory. They now see the Build Output directory. For example, Nuxt 4.6 with `server: { builder: 'vite' }` no longer fails with `NUXT_B7021` looking for the client manifest in `.output/public`. A build in which another plugin moves a Build Output directory now fails with an error that names the environment and the directory it requires, instead of the plugin silently moving it back.
