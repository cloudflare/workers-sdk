---
"miniflare": patch
---

Fix missing Workers types when installing Miniflare

The published declarations import `@cloudflare/workers-types`, but the package only listed it as a devDependency, so a project that installed miniflare without it failed to type-check with `TS2307` errors. It is now a regular dependency, which puts the types in the install tree for every consumer instead of relying on each project to add them.
