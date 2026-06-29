---
"miniflare": minor
---

Support Queues across separate local dev processes

Running a Queue producer and consumer as separate `wrangler dev` processes used to drop messages silently: `.send()` resolved, but the consumer's `queue()` handler never ran. Messages now route between processes through the dev registry, the same as when you run both Workers under a single `wrangler dev -c producer -c consumer` command.

This works automatically whenever both processes share the dev registry, which is the default.

Known limitations:

- Messages produced before the consumer process has registered (or while it is down or reloading) are dropped rather than buffered, so start the consumer first or expect a short startup window where early sends are lost. Each dropped message produces a debug-level log.
- A statically configured producer `delivery_delay` is not applied when the consumer runs in another process (a per-send `delaySeconds` still is).
- A dead-letter queue whose consumer runs in a third process is not routed across the registry: the message is reported as moved to the dead-letter queue and then dropped.
