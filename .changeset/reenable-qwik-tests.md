---
"create-cloudflare": patch
---

Bump `create-qwik` from 1.19.0 to 1.19.1

This update fixes an upstream issue where `create-qwik` installed `@eslint/js` at "latest", which resolved to v10 and conflicted with the project's eslint 9.x.
