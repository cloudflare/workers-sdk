---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Fix asset uploads to properly skip symbolic links

Previously, symbolic links in your assets directory were followed during upload: a symlinked file's target, or the contents of a symlinked directory, could be collected and uploaded as assets. Now both symbolic links and symlinked directories are skipped, so only real files inside your assets directory are uploaded.
