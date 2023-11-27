---
"miniflare": patch
---

fix: return non-WebSocket responses for failed WebSocket upgrading `fetch()`es

Previously, Miniflare's `fetch()` would throw an error if the `Upgrade: websocket` header was set, and a non-WebSocket response was returned from the origin. This change ensures the non-WebSocket response is returned from `fetch()` instead, with `webSocket` set to `null`. This allows the caller to handle the response as they see fit.
