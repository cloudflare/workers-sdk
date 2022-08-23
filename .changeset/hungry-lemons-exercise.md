---
"wrangler": patch
---

fix: Multiworker and static asset dev bug preventing both from being used

There was previously a collision on the generated filenames which resulted in the generated scripts looping and crashing in Miniflare with error code 7. By renaming one of the generated files, this is avoided.
