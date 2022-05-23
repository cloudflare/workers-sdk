---
"wrangler": patch
---

fix: ensure that the proxy server shuts down to prevent `wrangler dev` from hanging

When running `wrangler dev` we create a proxy to the actual remote Worker.
After creating a connection to this proxy by a browser request the proxy did not shutdown.
Now we use a `HttpTerminator` helper library to force the proxy to close open connections and shutdown correctly.

Fixes #958
