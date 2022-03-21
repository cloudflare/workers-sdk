---
"wrangler": patch
---

fix: resolve npm modules correctly

When implementing legacy module specifiers, we didn't throughly test the interaction when there weren't any other files next to the entry worker, and importing npm modules. It would create a Regex that matched _every_ import, and fail because a file of that name wasn't present in the source directory. This fix constructs a better regex, applies it only when there are more files next to the worker, and increases test coverage for that scenario.

Fixes https://github.com/cloudflare/wrangler2/issues/655
