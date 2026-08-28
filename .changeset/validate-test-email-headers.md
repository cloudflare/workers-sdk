---
"miniflare": patch
---

Validate custom headers sent through the Local Explorer test-email endpoint

Reject header names and values that cannot be safely encoded. Multiline values remain supported and are folded into valid MIME continuation lines.
