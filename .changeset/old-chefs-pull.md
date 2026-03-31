---
"wrangler": patch
---

fix: Sort D1 migration files to ensure consistent chronological ordering

`wrangler d1 migrations list` and `wrangler d1 migrations apply` previously returned migration files in an order dependent on the filesystem, which could vary across operating systems. Migration filenames are now sorted alphabetically before being returned, ensuring consistent chronological ordering.
