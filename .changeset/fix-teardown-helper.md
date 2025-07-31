---
"wrangler": patch
---

Switch teardown helper from afterEach to onTestFinished to improve console log handling

Resolves the TODO comment in teardown.ts by switching from `afterEach()` to `vitest.onTestFinished()` while avoiding the timing issue where console spies get restored before teardown callbacks run.
