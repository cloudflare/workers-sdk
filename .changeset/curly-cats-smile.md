---
"wrangler": patch
---

Preserve colons in `wrangler cloudchamber curl` header values

Header values are now split from their names at the first colon, and malformed headers produce a clear user-facing error instead of being truncated or causing a `TypeError`.
