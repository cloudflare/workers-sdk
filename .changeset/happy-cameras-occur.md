---
"@cloudflare/local-explorer-ui": patch
---

Improves local explorer invalid route error handling.

Visiting a route either as a 404 or 500 error now has dedicated components to handle as such, rather than the generic TanStack error UI.

Additionally, it also fixes route loaders to correctly throw a 404 error if a resource is not found, rather than showing a generic error.
