---
"miniflare": minor
---

Experimental: attribute local-dev observability traces to their worker

Local observability already captures every user worker (the collector is attached to each one), and a request that crosses a service binding is stitched into a single distributed trace. This adds per-worker attribution: each captured span now records the worker (`service`) that produced it, so multi-worker setups — and cross-worker distributed traces — can be grouped and filtered by worker. Miniflare passes each worker's name to the collector via binding props (workerd doesn't surface it on the tail locally), and the trace store gains a `service` column plus a `service_count` per trace in the list view.
