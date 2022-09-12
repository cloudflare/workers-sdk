---
"wrangler": patch
---

fix: Publish error when no upstream Worker existed
try/catch handles the check for last deployed source.
The check breaking when no available Worker was upstream to check,
which was causing deployments of new workers to fail.

fixes #1824
