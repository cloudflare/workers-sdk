---
"@cloudflare/vite-plugin": minor
---

Add a `build` command to the experimental, internal `cf-vite` delegate binary

`cf-vite build` runs Vite's full multi-environment app build (via the Builder API) and enables the experimental Build Output API by default, emitting a self-contained `.cloudflare/output/v0/` directory. It forces `experimental.newConfig` and `experimental.newConfig.cfBuildOutput` on, so a `cloudflare.config.ts` is required at the project root.
