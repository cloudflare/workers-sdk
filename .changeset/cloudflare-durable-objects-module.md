---
"@cloudflare/vite-plugin": minor
---

Support standard decorators in Worker code

Worker code that uses standard (TC39) decorators previously failed to start in `vite dev` with `SyntaxError: Invalid or unexpected token`, and `vite build` output kept the decorator syntax, which the Workers runtime cannot parse. The plugin now lowers standard decorators in Worker environments, matching Wrangler's bundling. Modules without decorators are not changed.

`cloudflare:durable-objects` is also now treated as a built-in runtime module.
