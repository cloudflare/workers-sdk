---
"wrangler": patch
---

fix: ensure `wrangler pages dev` exits cleanly

Previously, pressing <kbd>CTRL</kbd>+<kbd>C</kbd> or <kbd>x</kbd> when running `wrangler pages dev` wouldn't actually exit `wrangler`. You'd need to press <kbd>CTRL</kbd>+<kbd>C</kbd> a second time to exit the process. This change ensures `wrangler` exits the first time.
