---
"wrangler": minor
---

After this PR, `wrangler init --yes` will generate a test for your new Worker project, using Vitest with TypeScript.
When using `wrangler init`, and choosing to create a Typescript project, you will now be asked if Wrangler should write tests for you, using Vitest.

This resolves issue #2436.
