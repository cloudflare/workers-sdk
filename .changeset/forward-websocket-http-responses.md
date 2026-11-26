---
"@cloudflare/vite-plugin": patch
---

Forward HTTP responses to rejected WebSocket upgrades in `vite dev` and `vite preview`

Previously, the connection could close before clients received an HTTP response. When Vite receives a rejection response from the local Workers runtime, it now sends the status code, headers, and body to the client before closing the connection.
