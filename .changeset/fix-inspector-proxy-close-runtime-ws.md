---
"miniflare": patch
---

Close runtime WebSocket in InspectorProxy dispose

`InspectorProxy.dispose()` was closing the devtools WebSocket but not the runtime WebSocket connection to workerd's inspector server. The open WebSocket kept the Node.js event loop alive, contributing to `wrangler dev` hanging on Ctrl-C.
