---
"wrangler": major
---

Remove the deprecated `wrangler publish` command. Instead, use `wrangler deploy`, which takes exactly the same arguments.

Additionally, remove the following deprecated commands, which are no longer supported.

- `wrangler config`
- `wrangler preview`
- `wrangler route`
- `wrangler subdomain`

Remove the following deprecated command aliases:

- `wrangler secret:*`, replaced by `wrangler secret *`
- `wrangler kv:*`, replaced by `wrangler kv *`
