---
"miniflare": major
---

Change the Miniflare plugin API

Plugins now receive parsed Miniflare worker and instance config instead of per-plugin option slices. Per-plugin option schema exports have been removed; unsafe plugin authors should read bindings, exports, and triggers from the parsed config passed to plugin hooks.
