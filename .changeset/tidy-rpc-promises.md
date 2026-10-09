---
"miniflare": patch
---

Fix Node.js RPC calls deadlocking when a Worker calls back into Node.js

The first call to a Worker RPC method could block the Node.js event loop while waiting for the Worker to finish, preventing Node.js-backed bindings from responding. This also affected Workflow creation through Wrangler's `createTestHarness().getWorker().getExport()` API. RPC results now use the existing asynchronous promise bridge without changing synchronous native API handling or Workflow storage deletion safeguards.
