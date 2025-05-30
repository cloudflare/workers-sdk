---
"@cloudflare/workers-shared": minor
---

Adds support for static routing to Workers Assets

Implements the proposal noted here https://github.com/cloudflare/workers-sdk/discussions/9143

In brief: when static routing is present for a Worker with assets, routing via those static rules takes precedence. When a request is evaluated in the Router Worker, the request path is first compared to the "asset" rules (which are to be specific via "negative" rules, e.g. "!/api/assets"). If any match, the request is forwarded directly to the Asset Worker. If instead any "user\_worker" rules match, the request is forwarded directly to the User Worker. If neither match (or static routing was not provided), the existing behavior takes over.

As part of this explicit routing, when static routing is present, the check against "Sec-Fetch-Mode: navigate" (to guess if this should serve an asset or go to the User Worker for not\_found\_handling) is disabled. Routing can be controlled by setting routing rules via "run\_worker\_first", and asset serving (including when an index.html or 404.html page is served) will be more simple.
