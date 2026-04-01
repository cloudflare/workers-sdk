---
"wrangler": patch
---

Improve error message when deploying dynamic worker loaders on a free plan

Previously, deploying a Worker with a dynamic worker loader binding on a free account produced a generic validation error (`binding LOADER of type worker_loader is invalid [code: 10021]`), with a link to documentation about validation errors. This now shows a clear message explaining that dynamic worker loaders require a Workers Paid plan, with a link to upgrade.
