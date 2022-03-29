---
"wrangler": patch
---

bugfix: The proxyServer was conducting async behavior in useEffect without cleaning up the SIGINT didn't allow for graceful shutdown for subsequent startups of proxyServer.

fixes #375
