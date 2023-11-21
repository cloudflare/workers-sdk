---
"wrangler": patch
---

fix: open browser to correct url pressing `b` in `--remote` mode

This change ensures Wrangler doesn't try to open `http://*` when `*` is used as the dev server's hostname. Instead, Wrangler will now open `http://127.0.0.1`.
