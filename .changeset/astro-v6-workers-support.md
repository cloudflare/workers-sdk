---
"create-cloudflare": patch
---

Update Astro Workers template for Astro v6

The Astro Workers template now scaffolds projects using Astro v6. The adapter uses the Cloudflare Vite plugin under the hood, so `astro dev` runs on the workerd runtime locally and `wrangler.jsonc` fields like `main` and `assets` are no longer needed in the template.

For existing projects, see the [Astro Cloudflare adapter migration guide](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#upgrading-to-v13-and-astro-6).
