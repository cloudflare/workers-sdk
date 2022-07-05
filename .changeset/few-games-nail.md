---
"wrangler": patch
---

fix: use fork to let wrangler know miniflare is ready

This PR replaces our use of `spawn` in favour of `fork` to spawn miniflare in wrangler's dev function. This lets miniflare let wrangler know when we're ready to send requests, and gives us a process ID to kill as part of `unstable_dev()`'s stop function.

Closes #1408
