---
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Rename the `web_search` binding kind to `websearch`

Pre-launch rename of the public binding type from `web_search` to `websearch` so the on-the-wire shape matches the product name (Web Search). The wrangler config key, the binding-type string sent to the Cloudflare API, and the miniflare option key all move from `web_search` / `webSearch` to `websearch`.

Update your wrangler config:

```diff
- "web_search": { "binding": "WEBSEARCH" }
+ "websearch": { "binding": "WEBSEARCH" }
```

The runtime `WebSearch` type exposed on `env.WEBSEARCH` is unchanged.
