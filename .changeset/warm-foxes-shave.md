---
"miniflare": patch
---

Remove `LOCAL_EXPLORER_BASE_PATH` and `LOCAL_EXPLORER_API_PATH` constants in favor of `CorePaths.EXPLORER`

These were redundant aliases introduced before `CorePaths` was centralized. All internal consumers now use `CorePaths.EXPLORER` directly.
