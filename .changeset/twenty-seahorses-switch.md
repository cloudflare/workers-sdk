---
"wrangler": patch
---

polish: show paths of created files with `wrangler init`

This patch modifies the terminal when running `wrangler init`, to show the proper paths of files created during it (like `package.json`, `tsconfig.json`, etc etc). It also fixes a bug where we weren't detecting the existence of `src/index.js` for a named worker before asking to create it.
