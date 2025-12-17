---
"wrangler": patch
---

The auto-configuration logic present in `wrangler setup` and `wrangler deploy --x-autoconfig` cannot reliably handle Hono projects, so in these cases make sure to properly error saying that automatically configuring such projects is not supported.
