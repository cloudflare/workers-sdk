---
"wrangler": patch
---

Enable the new configuration format in the `cf-wrangler` dev delegate

Projects started through `cf dev` now load `cloudflare.config.ts` and optional `wrangler.config.ts`, matching the configuration used by the delegate's build path.
