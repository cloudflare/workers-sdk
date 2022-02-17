---
"wrangler": patch
---

fix: remove warning if worker with a durable object doesn't have a name

We were warning if you were trying to develop a durable object with an unnamed worker. Further, the internal api would actually throw if you tried to develop with a named worker if it wasn't already published. The latter is being fixed internally and should live soon, and this fix removes the warning completely.
