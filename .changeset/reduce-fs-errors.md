---
"create-cloudflare": patch
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Optimize filesystem operations by using Node.js's throwIfNoEntry: false option

This reduces the number of system calls made when checking for file existence by avoiding the overhead of throwing and catching errors for missing paths. This is an internal performance optimization with no user-visible behavioral changes.
