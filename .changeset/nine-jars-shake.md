---
"wrangler": patch
---

Fix spurious `Trailing comma jsonc(519)` warnings for `wrangler.jsonc` in VS Code 1.131+

Trailing commas in `wrangler.jsonc` files that reference Wrangler's JSON schema are no longer reported as errors by recent versions of VS Code. Wrangler always accepted these files; only the editor warning was wrong.
