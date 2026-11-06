---
"wrangler": patch
---

Reconnect `wrangler tail` to the existing tail when its connection drops

Previously, every reconnect deleted the server-side tail and registered a new one. `wrangler tail` now keeps the tail it created and opens a new WebSocket connection to it. A new tail is only created if the existing one has expired or the server no longer accepts connections to it.
