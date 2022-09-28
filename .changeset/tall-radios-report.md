---
"wrangler": patch
---

fix: use node http instead of faye-websocket in proxy server

We change how websockets are handled in the proxy server, fixing multiple issues of websocket behaviour, particularly to do with headers.

In particular this fixes:

- the protocol passed between the client and the worker was being stripped out by wrangler
- wrangler was discarding additional headesr from websocket upgrade response
- websocket close code and reason was not being propagated by wrangler
