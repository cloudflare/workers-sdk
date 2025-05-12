---
"miniflare": patch
---

fix: ensure the fetch proxy message port is started

While Node.js will start the message port automatically when a `message` event listener is added,
this diverges from the standard Web API for message ports, which require you to explicitly start
listening on the port.
