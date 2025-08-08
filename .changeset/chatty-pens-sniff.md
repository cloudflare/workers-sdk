---
"wrangler": patch
---

Do not attempt to update queue producer settings when deploying a Worker with a queue binding

Previously, each deployed Worker would update a subset of the queue producer's settings for each queue binding, which could result in broken queue producers or at least conflicts where different Workers tried to set different producer settings on a shared queue.
