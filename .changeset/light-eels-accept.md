---
"wrangler": patch
---

fix: disable persistence without `--persist` in `--experimental-local`

This ensures `--experimental-local` doesn't persist data on the file-system, unless the `--persist` flag is set.
Data is still always persisted between reloads.
