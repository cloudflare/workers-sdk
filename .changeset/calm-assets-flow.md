---
"@cloudflare/workers-shared": patch
"miniflare": patch
---

Improve asset serving performance by removing an unnecessary internal dispatch hop

Asset requests and RPC calls now avoid an extra internal forwarding layer, reducing latency. The forwarding infrastructure is preserved for future use by cohort-based deployments.
