---
"wrangler": patch
---

Add `images` as a valid `--source` for `queues subscription create`

The Cloudflare Images service can emit events (e.g. `image.uploaded`) to a
Cloudflare Queue via the event subscriptions API, and this is supported by both
the REST API and the Cloudflare Dashboard. However, the wrangler CLI was missing
`images` from the hardcoded `--source` choices list, causing the command to
reject it with an "Invalid values" error.

You can now subscribe a queue to Cloudflare Images events via the CLI:

```sh
wrangler queues subscription create <queue> --source images --events image.uploaded
```
