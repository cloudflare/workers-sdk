---
"wrangler": patch
---

Fix port availability check probing the wrong host when host changes

`memoizeGetPort` correctly invalidated its cached port when called with a different host, but then still probed the original host for port availability. This could return a port that was free on the original host but already in use on the requested one, leading to bind failures at startup.
