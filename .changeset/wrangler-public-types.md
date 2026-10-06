---
"wrangler": patch
---

Remove private build dependencies from Wrangler's published declaration surface

Wrangler now resolves bundled, dev-only type dependencies into its declaration output instead of exposing them as imports that downstream projects cannot install. Runtime dependencies and peer dependencies remain external.
