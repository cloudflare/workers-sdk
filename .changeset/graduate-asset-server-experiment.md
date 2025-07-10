---
"@cloudflare/workers-shared": patch
---

perf: graduate asset-server binary search experiment to 100%

The improved iterative binary search implementation has been graduated from a 50% experiment to the default implementation. This provides better performance for asset manifest lookups by replacing the recursive binary search with an iterative approach.
