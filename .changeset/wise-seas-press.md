---
"wrangler": patch
---

fix: validate `Host` and `Orgin` headers where appropriate

`Host` and `Origin` headers are now checked when connecting to the inspector proxy. If these don't match what's expected, the request will fail.
