---
"wrangler": patch
---

Report `.dev.vars` and `.env` files that are not UTF-8 instead of silently loading no variables

Before Wrangler would incorrectly read non UTF-8 `.dev.vars` and `.env` files as UTF-8. A `.dev.vars` file that is not UTF-8 now stops `wrangler dev` with a message that says how to fix it, and a `.env` file that is not UTF-8 is skipped with a warning. UTF-8 files, with or without a BOM, load as before.
