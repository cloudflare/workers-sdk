---
"miniflare": patch
---

Handle errors on sockets handed to the loopback server's `"upgrade"` listener. A peer resetting a refused WebSocket upgrade crashed the host process with an unhandled `ECONNRESET`, and the refused connection stayed open forever: ending the response doesn't close the socket, and the loopback server disables its keep-alive timeout. The socket is now closed once a refused upgrade response has been written.
