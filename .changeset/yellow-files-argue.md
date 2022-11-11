---
"wrangler": patch
---

Fix Var string type:
The type was not being coerced to a string, so TypeScript considered it a unresolved type.
