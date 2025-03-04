---
"wrangler": patch
---

chore: add concurrency and caching for Zone IDs and Workers routes lookups

Workers with many routes can result in duplicate Zone lookups during deployments, making deployments unnecessarily slow. This compounded by the lack of concurrency when making these API requests.

This change deduplicates these requests and adds concurrency to help speed up deployments.
