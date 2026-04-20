---
"wrangler": minor
---

Add namespace support to `wrangler ai-search` commands

All `wrangler ai-search` instance commands (`create`, `list`, `get`, `update`, `delete`, `stats`, `search`) now accept a `--namespace` (or `-n`) flag to target a specific AI Search namespace. When the flag is omitted, commands default to the `default` namespace that Cloudflare automatically provisions for every account.

`wrangler ai-search list` now displays a `namespace` column, and `wrangler ai-search create` offers an interactive picker for existing namespaces (with an option to create a new one) when `--namespace` is not supplied in an interactive session.

A new `wrangler ai-search namespace` subcommand group is also introduced, with `list`, `create`, `get`, `update`, and `delete` subcommands for managing namespaces directly.

```sh
wrangler ai-search list --namespace blog
wrangler ai-search create my-instance --namespace blog --type r2 --source my-bucket
wrangler ai-search namespace create blog --description "Blog content"
```
