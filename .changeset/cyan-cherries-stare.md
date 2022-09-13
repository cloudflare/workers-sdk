---
"wrangler": patch
---

fix: Publish error when deploying new Workers

This fix adds a try/catch when checking when the Worker was last deployed.

The check was failing when a Worker had never been deployed, causing deployments of new Workers to fail.

fixes #1824
