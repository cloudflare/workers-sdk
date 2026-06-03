---
"wrangler": patch
---

Update `wrangler secret bulk` command description to reflect create/update/delete capabilities

The help text for `wrangler secret bulk` now accurately describes that the command can create, update, or delete multiple secrets in a single request, with up to 100 secrets per command. The file argument description also clarifies that setting a key to `null` in JSON will delete it, and that deletion is not supported with `.env` files.
