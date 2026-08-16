---
"wrangler": patch
---

Remove generated `Buffer` and `process` declarations typed as `any` from runtime types so they no longer shadow `@types/node` globals.
