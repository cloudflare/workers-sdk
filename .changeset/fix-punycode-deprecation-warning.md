---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Remove the `punycode` module deprecation warning (`DEP0040`) logged on every Wrangler invocation.

The bundled `cloudflare` API client depends on `node-fetch@2.x`, which depends on `whatwg-url@5.0.0` and its `tr46@0.0.3` dependency. Both of those directly `require("punycode")` against Node's deprecated built-in module rather than the userland `punycode` package. Patched both to require the userland package instead (same API, no behavior change), so Wrangler no longer prints `(node:...) [DEP0040] DeprecationWarning: The 'punycode' module is deprecated. Please use a userland alternative instead.` on startup.
