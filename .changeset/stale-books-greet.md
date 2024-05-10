---
"@cloudflare/pages-shared": patch
---

fix: omit headers rules on internal error

The Pages asset handler will no longer apply headers rules on 5XX responses caused by some internal error.
This prevents transient errors from being cached when caching headers are being set by headers rules.
