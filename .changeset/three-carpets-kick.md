---
"wrangler": patch
---

fix: show up-to-date sources in DevTools when saving source files

Previously, DevTools would never refresh source contents after opening a file, even if it was updated on-disk. This could cause issues with step-through debugging as breakpoints set in source files would map to incorrect locations in bundled Worker code. This change ensures DevTools' source cache is cleared on each reload, preventing outdated sources from being displayed.
