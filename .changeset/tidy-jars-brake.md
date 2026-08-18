---
"wrangler": minor
---

Add `--local` to `wrangler flagship flags`, and a `pull` command to populate the local store

`wrangler dev` now evaluates Flagship flags against a local store, which starts out empty. `wrangler flagship flags pull <APP_ID>` copies the flags from a remote Flagship app into it, so local evaluation reflects your real flag configuration. Flags that exist only locally are left untouched and reported.

The `flags` commands — `create`, `get`, `list`, `update`, `delete`, `enable`, `disable`, `set`, `rollout`, `split`, `evaluate` and the `rules` subcommands — now accept `--local` to act on that store instead of the remote app, along with `--persist-to` to choose where it lives. This lets you try out flag configurations, including how they evaluate, without creating them in your account:

```sh
wrangler flagship flags create my-app checkout-v2 --type boolean --local
wrangler flagship flags rollout my-app checkout-v2 --to on --percentage 50 --local
wrangler flagship flags evaluate my-app checkout-v2 --targeting-key user-123 --local
```

These commands still default to the remote app, so existing usage is unchanged.
