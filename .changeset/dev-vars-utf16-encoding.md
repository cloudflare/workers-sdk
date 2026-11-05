---
"wrangler": patch
---

Report `.dev.vars` and `.env` files that are not UTF-8 instead of silently loading no variables

Wrangler read these files as UTF-8, so a UTF-16 file (what `"KEY=value" > .dev.vars` writes in Windows PowerShell 5.1) decoded to replacement characters and parsed as zero variables, while Wrangler still printed `Using secrets defined in .dev.vars`. A `.dev.vars` file that is not UTF-8 now stops `wrangler dev` with a message that says how to fix it, and a `.env` file that is not UTF-8 is skipped with a warning. UTF-8 files, with or without a BOM, load as before.
