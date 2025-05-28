---
"@cloudflare/vite-plugin": patch
---

Prevent leaking Miniflare server logs. Logs that were previously filtered were leaking as they were changed to include colors. We now override the new Miniflare `Log.logReady` method with a noop rather than filtering the logs.
