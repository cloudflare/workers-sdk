---
"wrangler": patch
---

Show a useful error when `wrangler secret bulk` hits an undeployed latest version

`wrangler secret put` already explained this case (API error 10215). `secret bulk` just dumped the raw API response, which for 10214 talks about logpush and tail_consumers even though you were only uploading secrets.

Both commands now point at `wrangler versions secret …` instead.
