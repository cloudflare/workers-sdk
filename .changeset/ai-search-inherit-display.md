---
"wrangler": patch
---

Fix inherited `ai_search_namespaces` binding display in `wrangler deploy`

When an `ai_search_namespaces` binding inherits from the existing deployment, the bindings table now correctly shows `(inherited)` instead of a raw `Symbol(inherit_binding)` string.
