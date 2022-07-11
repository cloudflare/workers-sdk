---
"wrangler": patch
---

Fixed an issue where Pages upload would OOM. This was caused by us loading all the file content into memory instead of only when required.
