---
"@cloudflare/vite-plugin": patch
---

Ensure that Node.js polyfills are pre-optimized before the first request

Previously, these polyfills were only optimized on demand when Vite became aware of them.
This was either because Vite was able to find an import to a polyfill when statically analysing the import tree of the entry-point,
or when a polyfilled module was dynamically imported as part of a executing code to handle a request.

In the second case, the optimizing of the dynamically imported dependency causes a reload of the Vite server, which can break applications that are holding state in modules during the request.
This is the case of most React type frameworks, in particular React Router.

Now, we pre-optimize all the possible Node.js polyfills when the server starts before the first request is handled.
