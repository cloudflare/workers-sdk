---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Remove the `punycode` module deprecation warning (`DEP0040`) logged on every Wrangler invocation.

Wrangler no longer prints `(node:...) [DEP0040] DeprecationWarning: The "punycode" module is deprecated. Please use a userland alternative instead.` when you run a command.
