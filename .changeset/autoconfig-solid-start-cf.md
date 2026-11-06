---
"@cloudflare/autoconfig": minor
---

Support SolidStart on `cf` from version 2.0.0

Autoconfig now configures SolidStart 2 projects for `cf`. It replaces Nitro with the Cloudflare Vite plugin on SolidStart's `ssr` environment, as SolidStart's deployment guide describes, and uses SolidStart 2's Vite commands instead of Vinxi's. It also keeps `@solidjs/start` out of the `ssr` environment's pre-bundled dependencies, so that server functions work in dev. Projects configured for Wrangler keep using Nitro.
