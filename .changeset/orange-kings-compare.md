---
"wrangler": patch
---

fix: put config cache log behind logger.debug

Prior to this change, wrangler would print `Retrieving cached values for...` after almost every single command.

After this change, you'll only see this message if you add `WRANGLER_DEBUG=true` before your command.

Closes #1808
