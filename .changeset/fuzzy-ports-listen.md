---
"miniflare": patch
---

Fix occupied-port diagnostics when runtime errors arrive in separate stderr chunks

Miniflare now reconstructs complete stderr lines before checking startup failures for an address already in use. This preserves the specific error and full address even when workerd splits the message across writes, instead of reporting a generic runtime startup failure or an incomplete address.
