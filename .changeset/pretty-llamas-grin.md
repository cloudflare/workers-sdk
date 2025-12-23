---
"wrangler": patch
---

Notify user on local dev server reload.

When running `wrangler dev`, the local server suppresses Miniflare's reload messages to prevent duplicate log entries from the proxy and user workers. This update adds a reload complete message so users know their changes were applied, instead of only seeing "Reloading local server...".
