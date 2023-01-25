---
"wrangler": patch
---

fix: cleans up `d1 list` output for json

Before:

```bash
rozenmd@cflaptop test % npx wrangler d1 list
--------------------
🚧 D1 is currently in open alpha and is not recommended for production data and traffic
🚧 Please report any bugs to https://github.com/cloudflare/wrangler2/issues/new/choose
🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
🚧 To give feedback, visit https://discord.gg/cloudflaredev
--------------------

┌──────────────────────────────┬─────────────────┐
│ uuid                         │ name            │
├──────────────────────────────┼─────────────────┤
│ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test            │
├──────────────────────────────┼─────────────────┤
│ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test2           │
├──────────────────────────────┼─────────────────┤
│ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test3           │
└──────────────────────────────┴─────────────────┘
```

After:

```bash
rozenmd@cflaptop test % npx wrangler d1 list --json
[
  {
    "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
    "name": "test"
  },
  {
    "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
    "name": "test2"
  },
  {
    "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
    "name": "test3"
  },
]
```
