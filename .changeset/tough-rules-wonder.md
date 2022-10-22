---
"wrangler": patch
---

Fixed issue where information and warning messages from Miniflare were being
discarded when using `wrangler dev --local`. Logs from Miniflare will now be
coloured too, if the terminal supports this.
