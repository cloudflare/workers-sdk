---
"wrangler": patch
---

fix: resolve a regression where `wrangler pages dev` would bind to port 8787 by default instead of 8788 since wrangler@3.38.0
