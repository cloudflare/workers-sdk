---
"@cloudflare/pages-shared": patch
"@cloudflare/workers-shared": patch
"wrangler": patch
"miniflare": patch
---

Fix redirect and header rules with placeholder names that share a prefix

Rules using placeholder names such as `:id` and `:id_2` now match and substitute each placeholder correctly. Previously, these rules could silently fail to match or produce incorrect redirect destinations and header values.
