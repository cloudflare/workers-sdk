---
"wrangler": patch
---

chore: enable node's experimental fetch flag

We'd previously had some funny behaviour with undici clashing with node's own fetch supporting classes, and had turned off node's fetch implementation. Recent updates to undici appear to have fixed the issue, so let's turn it back on.

Closes https://github.com/cloudflare/wrangler2/issues/834
