---
"wrangler": patch
---

ci: run PR jobs on both Ubuntu, MacOS and Windows

- update .gitattributes to be consistent on Windows
- update Prettier command to ignore unknown files
  Windows seems to be more brittle here.
- tighten up eslint config
  Windows seems to be more brittle here as well.
- use the matrix.os value in the cache key
  Previously we were using `running.os` but this appeared not to be working.
