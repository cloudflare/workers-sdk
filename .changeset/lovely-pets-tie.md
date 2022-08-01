---
"wrangler": patch
---

Add support for Alarm Events in `wrangler tail`

`wrangler tail --format pretty` now supports receiving events from [Durable Object Alarms](https://developers.cloudflare.com/workers/learning/using-durable-objects/#alarms-in-durable-objects), and will display the time the alarm was triggered.

Additionally, any future unknown events will simply print "Unkonwn Event" instead of crashing the `wrangler` process.
