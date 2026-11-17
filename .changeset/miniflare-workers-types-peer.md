---
"miniflare": patch
---

Declare `@cloudflare/workers-types` as a peer dependency

The published type declarations import types from `@cloudflare/workers-types`, but the package only listed it as a devDependency, so a project that installed miniflare without it failed to type-check with `TS2307` errors. Declaring it as a peer dependency makes package managers install it alongside miniflare.
