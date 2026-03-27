---
"@cloudflare/vite-plugin": patch
---

Route dev-mode WebSocket service bindings to the entry worker

WebSocket upgrade requests sent to another local worker via a service binding now bypass the Vite middleware proxy and go straight to that worker's entrypoint in dev mode. This fixes multi-worker setups where the upgrade was incorrectly forwarded into the Node middleware service and the connection failed before the target worker could accept it.
