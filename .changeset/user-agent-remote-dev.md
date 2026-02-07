---
"wrangler": patch
---

Add User-Agent header to remote dev inspector WebSocket connections

When running `wrangler dev --remote`, the inspector WebSocket connection now includes a `User-Agent` header (`wrangler/<version>`). This resolves issues where WAF rules blocking empty User-Agent headers prevented remote dev mode from working with custom domains.
