---
"wrangler": patch
---

fix: make d1 help print if a command is incomplete

Prior to this change, d1's commands would return silently if wrangler wasn't supplied enough arguments to run the command.

This change resolves this issue, and ensures help is always printed if the command couldn't run.
