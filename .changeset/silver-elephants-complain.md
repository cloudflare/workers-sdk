---
"wrangler": patch
---

fix: create a single session during remote dev

Previously, we would be creating a fresh session for every script change during remote dev. While this _worked_, it makes iterating slower, and unnecessarily discards state. This fix makes it so we create only a single session for remote dev, and reuses that session on every script change. This also means we can use a single script id for every worker in a session (when a name isn't already given). Further, we also make the prewarming call of the preview space be non-blocking.

Fixes https://github.com/cloudflare/wrangler2/issues/1191
