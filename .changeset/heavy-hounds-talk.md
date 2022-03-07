---
"wrangler": patch
---

feat: add confirmation and success messages to `kv:bulk delete` command

Added the following:

- When the deletion completes, we get `Success!` logged to the console.
- Before deleting, the user is now asked to confirm is that is desired.
- A new flag `--force`/`-f` to avoid the confirmation check.
