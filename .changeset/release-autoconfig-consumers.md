---
"wrangler": patch
"create-cloudflare": patch
---

Include Astro 7 cf setup support in bundled autoconfig

Astro 7 projects configured for cf now install the latest compatible beta releases of Astro and the Cloudflare adapter. Configuration is delegated to Astro's `astro add @astrojs/cloudflare@beta` command so the adapter creates the appropriate cf configuration.
