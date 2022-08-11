---
"wrangler": patch
---

fix: Throw error when Pages Functions have no routes

Building pages functions with no valid handlers would result in a Functions script containing no routes, often because the user is using the functions directory for something unrelated.
