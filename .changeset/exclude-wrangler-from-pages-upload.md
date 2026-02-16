---
"wrangler": patch
---

fix: exclude `.wrangler` directory from Pages uploads

The `.wrangler` directory contains local cache and state files that should never be deployed. This aligns Pages upload behavior with Workers Assets, which already excludes `.wrangler` via `.assetsignore`.
