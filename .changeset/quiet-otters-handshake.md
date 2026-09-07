---
"miniflare": patch
---

Fix the synchronous binding proxy desynchronising when its worker thread is preempted

Synchronous binding calls made from Node — `D1Database#prepare`/`bind` and every other sync proxy method — block on a worker-thread handshake. The worker signalled a reply by storing `1` into a shared `Int32Array` and notifying; the caller reset it to `0`, posted the request, waited for a non-zero value and read the reply off the port. If the worker's store landed before the caller's wait (which then returned `"not-equal"` immediately) while its notify landed after the next request had already armed its own wait, that wait woke to an empty message queue, `assert(message?.id === id)` threw, and every later call received the previous call's reply. Only a preemption of the worker thread between its store and its notify is needed, so it surfaced as a rare cascade of `AssertionError: The expression evaluated to a falsy value: (message?.id === id)` on contended CI runners.

The handshake now publishes a per-request generation (`id + 1`) that the caller re-checks after every wake, so a stale notification is absorbed instead of consumed.
