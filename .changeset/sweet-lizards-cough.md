---
"@cloudflare/workers-shared": patch
---

Exclude trailing comments from `_redirects` line length validation

This is consistent with full line comments where the line length is not limited.

Additionally, the maximum line length for redirect directives has been corrected to 1000 characters (matching the Workers platform limit), down from 2000.
