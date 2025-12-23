---
"@cloudflare/workers-utils": patch
---

Fix the `triggers` JSON schema default value to use valid JSON (`{"crons":[]}`) instead of an invalid JavaScript literal, which was causing IDE auto-completion to insert a string rather than an object.
