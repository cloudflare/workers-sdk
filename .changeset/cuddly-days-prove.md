---
"@cloudflare/vite-plugin": patch
"@cloudflare/unenv-preset": patch
---

fix handling of Node builtin modules

The list builtin modules should not depend on the version of Node.
Switch to using the lists published by `@cloudflare/unenv-preset`.

This fixes an issue with trying to import i.e. `node:sqlite` with Node < 22.5.0
which does not implement this module.
