---
"wrangler": patch
---

fix: ensure `wrangler dev` exits with code `0` on clean exit

Previously, `wrangler dev` would exit with a non-zero exit code when pressing <kbd>CTRL</kbd>+<kbd>C</kbd> or <kbd>x</kbd>. This change ensures `wrangler` exits with code `0` in these cases.
