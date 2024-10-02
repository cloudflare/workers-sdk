---
"wrangler": patch
---

fix: reduce logging noise during wrangler dev with static assets

Updates to static assets are accessible by passing in --log-level="debug" but otherwise hidden.
