---
"miniflare": patch
---

Fix `QuotaExceededError` when a producer sends many queue messages locally

The local Queues broker registered a timer for every message it received, including messages with no delivery delay. workerd caps a Durable Object at 10000 active timeouts and none of those timers run while the producer is still sending, so a Worker that enqueued more than 10000 messages in one go failed with `QuotaExceededError: You have exceeded the number of active timeouts you may set`.

Messages without a delivery delay are now enqueued directly, and only delayed messages use a timer. This matches what the broker already did under Miniflare's fake timers, where a zero-delay timer runs synchronously.
