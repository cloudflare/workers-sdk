---
"@cloudflare/vite-plugin": patch
---

Add full support for `.dev.vars` files.

This change makes sure that `.dev.vars` files work when the environment is specified. It also
copies the target `.dev.vars` file (which might be environment specific, e.g. `.dev.vars.prod`)
to the worker's dist directory so that `vite preview` can pick it up.
The copied file will always be named `.dev.vars`.
