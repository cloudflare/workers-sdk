---
"wrangler": patch
---

fix: ensure that the Pages dev proxy server does not change the Host header

Previously, when configuring `wrangler pages dev` to use a proxy to a 3rd party dev server,
the proxy would replace the Host header, resulting in problems at the dev server if it was
checking for cross-site scripting attacks.

Now the proxy server passes through the Host header unaltered making it invisible to the
3rd party dev server.

Fixes #4799
