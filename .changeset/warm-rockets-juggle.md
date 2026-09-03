---
"@cloudflare/vite-plugin": minor
---

Support auxiliary and prerender Workers declared as named exports of `cloudflare.config.ts`.

Every named Worker export other than the reserved `prerender` export is included automatically as an auxiliary Worker. Use the `auxiliaryWorkers` object, keyed by export name, for Vite-specific overrides or to define Workers that are not exported from `cloudflare.config.ts`. Auxiliary Workers use their key as their Vite environment name by default, support overriding it with `viteEnvironment.name`, and are included in Build Output builds, previews, and prerendering. The entry and prerender Workers can likewise be configured in Vite, and a `prerender` Worker export configures the dedicated prerender Worker. `cloudflare.config.ts` is optional when all Worker configuration is supplied through Vite.
