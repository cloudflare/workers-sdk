---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
"miniflare": patch
---

Fix asset handling to properly skip symbolic links

Previously, symbolic links in your assets directory were followed: a symlinked file's target, or the contents of a symlinked directory, could be collected and served or uploaded as assets. Both `wrangler deploy` and the local dev server now skip symbolic links and do not descend into symlinked directories, so only real files inside your assets directory are used, and the two agree on which files that is.
