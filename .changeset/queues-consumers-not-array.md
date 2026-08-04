---
"@cloudflare/workers-utils": patch
---

Report a non-array `queues.consumers` as a configuration error instead of crashing

`validateQueues` pushed the `The field "queues.consumers" should be an array` diagnostic and then iterated the value anyway. `"queues": { "consumers": null }` therefore threw `TypeError: Cannot read properties of null (reading 'length')` before the diagnostic could be rendered, and `"queues": { "consumers": "my-queue" }` walked the string character by character, adding one bogus `"queues.consumers[0]" should be a objects, but got "m"` error per character on top of the real one.

The intended error is now the only thing reported, matching how the sibling `queues.producers` field already behaves.
