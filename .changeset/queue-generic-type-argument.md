---
"wrangler": minor
---

The `wrangler types` command now generates Queue bindings with generic type arguments (`Queue<unknown>`) instead of plain `Queue` types. This provides better type safety and allows developers to specify custom message types for their queue bindings when needed.
