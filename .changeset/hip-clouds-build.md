---
"miniflare": patch
---

Fix Durable Object RPC calls from Node.js blocking the event loop, preventing `Promise.race()` and timeouts from working correctly.

Previously, RPC calls from Node.js to Durable Objects would block the Node.js event loop, causing `Promise.race()` with timeouts to never resolve. This fix ensures that RPC calls properly yield control back to the event loop, allowing concurrent operations and timeouts to work as expected.
