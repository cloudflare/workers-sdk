---
"wrangler": patch
---

chore: Undici 5.11.0 multipart/form-data support
The 5.11.0 version of Undici now supports multipart/form-data previously needed a ponyfill
we can now handle the multipart/form-data without any custom code.

resolves #1977
