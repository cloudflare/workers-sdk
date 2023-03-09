---
"wrangler": minor
---

feature: add support for Queue Consumer concurrency

Consumer concurrency allows a consumer Worker processing messages from a queue to automatically scale out horizontally in order to keep up with the rate that messages are being written to a queue.
To enable concurrency for a queue consumer, set the `concurrency_enabled` option to `true`.
The `max_concurrency` setting can optionally be provided to limit the maximum number of concurrent invocations of a consumer worker.