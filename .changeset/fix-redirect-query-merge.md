---
"@cloudflare/workers-shared": patch
---

fix: merge incoming request query params with redirect destination query params

Previously, when a `_redirects` rule's destination contained query parameters (e.g. `/products?code=:code&name=:name`), any additional query parameters from the incoming request were silently dropped. The logic used an either/or choice (`destination.search || search`) rather than merging both sets of parameters.

Now, query parameters from the incoming request are merged with those from the redirect destination, with destination parameters taking precedence when the same key appears in both.
