---
"miniflare": patch
---

Make Miniflare inspector proxy more resilient to selecting a free port

We have seen some test flakes when there are a lot of Miniflare instances running in parallel.
This appears to be that there is a small chance that a port becomes unavailable between checking if it is free and using it.
