---
"wrangler": minor
---

Change how Wrangler selects default ports for dev sessions.

wrangler now probes 10 consecutive ports before falling back to a random port.
This will help getting a stable port number across dev sessions.
Both the http server and inspector ports are affected.
