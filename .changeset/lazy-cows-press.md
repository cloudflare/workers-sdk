---
"wrangler": patch
---

refactor: remove use of `any`

This "quick-win" refactors some of the code to avoid the use of `any` where possible.
Using `any` can cause type-checking to be disabled across the code in unexpectedly wide-impact ways.

There is one other use of `any` not touched here because it is fixed by #1088 separately.
