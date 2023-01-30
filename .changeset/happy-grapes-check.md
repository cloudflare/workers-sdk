---
"wrangler": minor
---

Previously, wrangler dev would not work if the root of your zone wasn't behind Cloudflare. This behaviour has changed so that now only the route which your Worker is exposed on has to be behind Cloudflare.
