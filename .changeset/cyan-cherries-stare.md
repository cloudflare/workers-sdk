---
"wrangler": patch
---

fix: Publish error when no upstream Worker existed
Add a try/catch when checking when the worker was last deployed
The check was failing when a Worker had never been deployed, causing deployments of new Workers to fail.

fixes #1824
