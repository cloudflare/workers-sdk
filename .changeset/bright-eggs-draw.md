---
"@cloudflare/workers-shared": patch
---

The asset-worker now uses a shorter 10-second TTL for cached assets, down from 60 seconds. This ensures that asset updates are reflected more quickly during development and deployment, reducing the window where stale assets might be served.
