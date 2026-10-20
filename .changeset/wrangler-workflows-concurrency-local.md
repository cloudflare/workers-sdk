---
"wrangler": minor
---

Manage local Workflow concurrency keys with `wrangler workflows concurrency --local`

Every `wrangler workflows concurrency` command now takes `--local` (and `--port`) to manage the keys of a running `wrangler dev` session instead of the account. Local keys also report how many steps hold and wait for them.

```sh
wrangler workflows concurrency create payments-api --limit 2 --local
wrangler workflows concurrency list --local
```
