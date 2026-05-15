---
"wrangler": patch
---

fix: stop rewriting query strings that happen to contain the request `Host`

`wrangler dev` previously rewrote occurrences of the outer host inside `request.url`'s query string. For example, a request to `?echo=https%3A%2F%2Fdevelopment.test%2Fpath` with `Host: development.test` would be seen by the user worker as `?echo=https%3A%2F%2Fproduction.test%2Fpath`, silently mutating opaque application data such as `redirect_uri` values in OAuth flows.

The proxy worker now sets the internal `MF-Original-URL` header *after* its blanket host-rewriting pass over request headers, so the URL passed to the user worker preserves the original query string.
