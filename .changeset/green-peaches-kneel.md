---
"wrangler": patch
---

chore: refactor wrangler.dev API to not need React/Ink

Prior to this change, `wrangler.unstable_dev()` would only support running one instance of wrangler at a time, as Ink only lets you render one instance of React. This resulted in test failures in CI.

This change creates pure JS/TS versions of these React hooks:

- useEsbuild
- useLocalWorker
- useCustomBuild
- useTmpDir

As a side-effect of removing React, tests should run faster in CI.

Closes #1432
Closes #1419
