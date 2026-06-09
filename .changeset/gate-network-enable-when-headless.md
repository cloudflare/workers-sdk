---
"wrangler": patch
---

Only enable the workerd Network inspector domain when a DevTools client is attached

`InspectorProxyWorker` sent `Network.enable` to the runtime on every connect even with no DevTools client attached. Run headless (e.g. a long-lived `wrangler dev` with containers), the runtime then streams a `Network.dataReceived` message per response body chunk into a buffer that is never drained without a client, flooding the inspector until the dev server stops accepting connections. Gate `Network.enable` on an attached DevTools client, mirroring the existing `Debugger.enable` gate. Fixes #14191.
