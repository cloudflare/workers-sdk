---
"wrangler": patch
---

fix: Default to today's compatibility date in `wrangler pages dev`

Like `wrangler dev` proper, `wrangler pages dev` now defaults to using today's compatibility date.
It can be overriden with `--compatibility-date=YYYY-MM-DD`.

https://developers.cloudflare.com/workers/platform/compatibility-dates/
