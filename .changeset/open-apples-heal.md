---
"wrangler": patch
---

Fix execution freezing on `debugger` statements when DevTools is not attached

Previously, `wrangler` always sent `Debugger.enable` to the runtime on connection, even when DevTools wasn't open. This caused scripts to freeze on `debugger` statements. Now `Debugger.enable` is only sent when DevTools is actually attached.
