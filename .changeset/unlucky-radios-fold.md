---
"@cloudflare/pages-shared": patch
---

fix: no longer allow zone caching for responses that returned 404. This is to prevent some files in a new deployment from returning and subsequently caching 404s while the deployment propagates across the network.
