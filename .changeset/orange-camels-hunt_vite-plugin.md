---
"@cloudflare/vite-plugin": patch
---

add full support for `.dev.vars` files

this change makes sure that `.dev.vars` files work for a specified environment, it also
copies the target `.dev.vars` file (which might be environment specific, eg: `.dev.vars.prod`)
to the worker's dist directory, always named `.dev.vars` (so that `vite preview` can pick it up)
