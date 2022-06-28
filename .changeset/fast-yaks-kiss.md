---
"wrangler": patch
---

fix: Fallback to non-interactive mode on error

If the terminal isn't a TTY, fallback to non-interactive mode instead of throwing an error. This makes it so users of Bash on Windows can pipe to wrangler without an error being thrown.

resolves #1303
