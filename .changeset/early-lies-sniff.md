---
"wrangler": patch
---

fix: `kv:key get`

The api for fetching a kv value, unlike every other cloudflare api, returns just the raw value as a string (as opposed to the `FetchResult`-style json). However, our fetch utility tries to convert every api response to json before parsing it further. This leads to bugs like https://github.com/cloudflare/wrangler2/issues/359. The fix is to special case for `kv:key get`.

Fixes https://github.com/cloudflare/wrangler2/issues/359.
