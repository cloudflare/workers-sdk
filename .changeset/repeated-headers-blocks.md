---
"@cloudflare/workers-shared": patch
"@cloudflare/pages-shared": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"miniflare": patch
"wrangler": patch
---

Apply repeated paths in `_headers` files in file order

A later block for the same path previously dropped headers from earlier blocks. Workers and Pages now apply every matching block in sequence, including header removals.
