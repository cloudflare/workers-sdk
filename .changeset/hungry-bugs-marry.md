---
"wrangler": patch
---

refactor: Moving `--legacy-env` out of global
The `--legacy-env` flag was in global scope, which only certain commands
utilize the flag for functionality, and doesnt do anything for the other commands.

resolves #933
