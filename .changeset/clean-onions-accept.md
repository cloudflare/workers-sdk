---
"miniflare": patch
---

Fix Durable Object RPC calls from Node.js blocking the event loop, preventing `Promise.race()` and timeouts from working correctly.
