---
"wrangler": patch
---

Make remote dev `exchange_url` optional

The edge-preview API's `exchange_url` is now treated as optional. When unavailable or when the exchange fails, the initial token from the API response is used directly. The `prewarm` step and `inspector_websocket` have been removed from the remote dev flow in favour of `tail_url` for live logs.
