---
"@cloudflare/build-output-utils": patch
---

Keep experimental Build Output portable when source assets are symlinks

Asset links are now copied as regular files and directories so Wrangler produces portable, self-contained Build Output that can be read successfully.
