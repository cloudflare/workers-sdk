---
"miniflare": minor
---

Support Queues across separate local dev processes

Queue producers can now send messages to consumers running in a separate local dev process. Messages produced before the consumer process has registered, or while it is down or reloading, are dropped rather than buffered, with a debug-level log emitted.
