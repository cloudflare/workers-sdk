---
"@cloudflare/vite-plugin": patch
---

Prevent leaking Miniflare server logs. Logs that were previously filtered were leaking as they were changed to include colors. We now explicitly opt out of Miniflare request logging in dev and have modified the filtering in preview.
