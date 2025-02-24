---
"@cloudflare/vite-plugin": patch
---

fix: use ESM WebSocketServer import to avoid crashing vite dev

It appears that if there are multiple versions of the `ws` package in a user's project
then the Node.js resolution picks up the ESM "import" package export rather than the "require" package export.
This results in the entry-point having different JS exports:
In particular the default export no longer contains a `Server` property; instead one must import the `WebSocketServer` named JS export.
While it is not clear why the Node.js behaviour changes in this way, the cleanest fix is to import the `WebSocketServer` directly.
