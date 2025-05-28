---
"@cloudflare/vite-plugin": patch
---

Prevent leaking Miniflare server logs. Logs that were previously filtered were leaking as they were changed to include colors. We now strip ANSI escape codes before filtering.
