---
"wrangler": patch
---

chore: update esbuild

Update esbuild to 0.14.14. Also had to change `import esbuild from "esbuild";` to `import * as esbuild from "esbuild";` in `dev.tsx`.
