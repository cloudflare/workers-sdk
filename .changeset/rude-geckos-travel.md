---
"wrangler": minor
---

Change how Wrangler selects default ports for dev sessions.

If no port is specified, Wrangler now probes the default port and the 10 consecutive ports after it before falling back to a random port.
This will help getting a stable port number across dev sessions.
Both the http server and inspector ports are affected.
