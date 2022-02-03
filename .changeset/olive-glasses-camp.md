---
"wrangler": patch
---

fix: remove redundant process.cwd() calls in `wrangler init`

Followup from https://github.com/cloudflare/wrangler2/pull/372#discussion_r798854509, just removing some unnecessary calls to `process.cwd()`/`path.join()`, since they're already relative to where they're called from.
