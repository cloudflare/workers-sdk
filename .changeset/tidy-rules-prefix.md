---
"@cloudflare/workers-shared": patch
---

Fixed _redirects and _headers rules silently not firing when two placeholders share a prefix (e.g. :id and :id_2).
