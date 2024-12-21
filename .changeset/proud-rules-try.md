---
"@cloudflare/pages-shared": patch
---

fix: Store an empty result when Early Hints parsing returns nothing or errors. Previously, we weren't storing anything which resulted in Early Hints being parsed on every request.
