---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Prevent date-enabled Node.js compatibility from adding conflicting globals to generated runtime types

Runtime type generation now treats Node.js compatibility enabled by a compatibility date the same way as an explicit `nodejs_compat` flag. Node.js globals continue to come from `@types/node` instead of being generated as `any` declarations that override those types.
