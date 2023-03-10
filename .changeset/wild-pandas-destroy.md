---
"wrangler": minor
---

feature: add support for Queue Consumer concurrency

Consumer concurrency allows a consumer Worker processing messages from a queue to automatically scale out horizontally in order to keep up with the rate that messages are being written to a queue.
The new `max_concurrency` setting can be used to limit the maximum number of concurrent consumer Worker invocations.