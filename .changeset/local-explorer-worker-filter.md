---
"miniflare": minor
"@cloudflare/local-explorer-ui": minor
---

Add worker filtering to the local explorer UI

When multiple workers share a dev registry, all their bindings were previously shown together in a single flat list. The explorer now shows a worker selector dropdown, letting you inspect each worker's bindings independently.

The selected worker is reflected in the URL as a `?worker=` search param, so deep links work correctly. By default the explorer selects the worker that is hosting the dashboard itself.
