---
"wrangler": patch
---

Fixed an issue that caused some Workers to have an incorrect service tag applied when using a redirected configuration file (as used by the Cloudflare Vite plugin). This resulted in these Workers not being correctly grouped with their sibling environments in the Cloudflare dashboard.
