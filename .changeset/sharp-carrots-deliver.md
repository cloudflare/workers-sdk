---
"wrangler": minor
---

feat: Also log when _no_ bindings are found.

We currently print a worker's bindings during dev, versions upload and deploy. This just also prints something when there's no bindings found, in case you _were_ expecting bindings.
