---
"wrangler": patch
---

Add warning regarding potential resources creation when running autoconfig on Next.js apps

When running the autoconfig logic (`wrangler setup` or `wrangler deploy --x-autoconfig`) on a Next.js apps, Cloudflare resources might be created during the setup, wrangler will now warn the user beforehand about this.
