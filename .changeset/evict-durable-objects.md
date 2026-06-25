---
"@cloudflare/vitest-pool-workers": patch
---

Add `evictDurableObject` and `evictAllDurableObjects` test helpers to `cloudflare:test`

These helpers let you exercise how a Durable Object behaves across evictions in your tests. Eviction is graceful: durable storage is preserved, in-memory state is reset by tearing down the instance, hibernatable WebSockets are hibernated rather than closed, and eviction waits for in-flight requests to drain.

```ts
import { evictDurableObject, evictAllDurableObjects } from "cloudflare:test";
import { env } from "cloudflare:workers";

const id = env.COUNTER.idFromName("my-counter");
const stub = env.COUNTER.get(id);

// Evict the Durable Object instance pointed to by a specific stub
await evictDurableObject(stub);
await evictDurableObject(stub, { webSockets: "close" });

// Evict all currently-running Durable Objects in evictable namespaces
await evictAllDurableObjects();
```
