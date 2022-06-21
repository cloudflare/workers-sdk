---
"wrangler": patch
---

fix: Correctly resolve directories for 'wrangler pages publish'

Previously, attempting to publish a nested directory or the current directory would result in parsing mangled paths which broke deployments. This has now been fixed.
