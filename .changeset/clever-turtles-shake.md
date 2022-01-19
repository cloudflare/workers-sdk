---
"wrangler": patch
---

refactor: tidy up the typings of the build result in dev

In #262 some of the strict null fixes were removed to resolve a regression.
This refactor re-applies these fixes in a way that avoids that problem.
