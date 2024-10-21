---
"wrangler": patch
---

fix: only show fetch warning if on old compatibility_date

Now that we have the `allow_custom_ports` compatibility flag, we only need to show the fetch warnings when that flag is not enabled.

Fixes https://github.com/cloudflare/workerd/issues/2955
