---
"wrangler": patch
---

Remove delegation message when global wrangler delegates to a local installation

A message used for debugging purposes was accidentally left in, and confused some
folks. Now it'll only appear when `WRANGLER_LOG` is set to `debug`.
