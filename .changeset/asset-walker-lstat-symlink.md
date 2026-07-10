---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Use `lstat` so the asset walker skips symlinks as intended

The Workers and Pages asset walkers intend to skip symbolic links (`if (filestat.isSymbolicLink())`), but call `stat()` first, which dereferences the link, so `isSymbolicLink()` always returns false and symlinked entries are followed and collected as assets. `isSymbolicLink()` is only meaningful after `lstat()`. Both walkers now use `lstat()` so the existing skip logic behaves as intended.
