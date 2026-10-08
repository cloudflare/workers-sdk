---
"@cloudflare/build-output-utils": patch
---

Dereference symlinks when writing assets to the experimental Build Output

Asset links are now copied as regular files and directories so Wrangler produces portable, self-contained Build Output that can be read successfully.
