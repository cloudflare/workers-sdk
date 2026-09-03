---
"wrangler": patch
---

Tolerate missing permissions during `wrangler delete` cleanup checks

`wrangler delete` now warns and continues when it cannot inspect Worker dependencies or clean up legacy Workers Sites KV namespaces because of missing permissions. The Worker delete request itself still fails normally if the token cannot delete the Worker.
