---
"@cloudflare/local-explorer-ui": patch
---

Fixed listing internal Cloudflare Durable Object tables.

The internal `_cf_KV` table that is used when using Durable Objects KV storage is now hidden from the table list dropdown in the local explorer as it is not accessible.
