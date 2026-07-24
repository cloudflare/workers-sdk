---
"wrangler": patch
---

Allow `wrangler dev --remote` to start when queue producer bindings are configured

Queue bindings are still unsupported in legacy remote dev mode, but Wrangler now omits them from remote preview uploads after warning. This lets unrelated routes keep working instead of returning 500 errors for the whole dev session.
