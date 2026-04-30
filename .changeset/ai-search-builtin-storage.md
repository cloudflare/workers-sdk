---
"wrangler": minor
---

Add `builtin` storage option to `wrangler ai-search create`.

`wrangler ai-search create` now supports a third storage type, `builtin`, in addition to `r2` and `web-crawler`. When `--type builtin` is selected (or chosen interactively), Wrangler creates the instance using Cloudflare-managed storage by omitting `type` and `source` from the API request — the API treats an absent `type` as builtin storage. Builtin instances do not accept `--source`, `--prefix`, `--include-items`, or `--exclude-items`.
