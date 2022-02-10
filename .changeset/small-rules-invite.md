---
"wrangler": patch
---

refactor: share worker bundling between both `publish` and `dev` commands

This changes moves the code that does the esbuild bundling into a shared file
and updates the `publish` and `dev` to use it, rather than duplicating the
behaviour.

See #396
Resolves #401
