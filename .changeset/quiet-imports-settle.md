---
"@cloudflare/vite-plugin": patch
---

Keep deferred imports alive after their originating request ends

Retain the module runner's RPC operation until its result is retrieved and cleaned up. This prevents subsequent requests from hanging on a cached import when the first request returns early or its client disconnects.
