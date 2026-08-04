---
"@cloudflare/vite-plugin": patch
"miniflare": patch
"wrangler": patch
---

Cut the per-request cost of local observability capture

Every tail event was written to the trace store as its own Durable Object call, so a request paid two or three round-trips per span. On a module-heavy app under the Vite plugin that dominated dev request latency. Rows are now buffered and written in batches, taking a request from roughly thirty calls to three.

Work in progress still shows up as it happens: the root span is written immediately, console logs and exceptions as they arrive, and a span's completion is written on the next event once 100ms has passed. An invocation that goes completely quiet writes nothing further until it ends, since the flush is driven by tail events rather than a timer.

The Vite plugin's own router, asset and proxy workers are also no longer captured. Their traces were noise the Observability views already hid, and skipping them cuts the spans recorded per request — a side benefit being that a trace's root is now your Worker rather than `__router-worker__`.
